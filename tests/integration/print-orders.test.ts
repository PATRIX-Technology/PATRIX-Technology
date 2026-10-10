import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * print_orders (migration 0037): a physical printed copy of an
 * already-approved story, paid for via a one-off Stripe Checkout session.
 * Same isolation/ownership properties every other tenant-scoped table in
 * this schema has, proven against real Postgres RLS — not mocks.
 */
describe('print orders (RLS)', () => {
  let db: TestDb;
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let ownerBId: string;
  let approvedStoryId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerAId = await createUser(db.adminClient, 'Owner A');
    ownerBId = await createUser(db.adminClient, 'Owner B');
    tenantAId = await createTenantWithOwner(db.adminClient, ownerAId, 'Nursery A');
    tenantBId = await createTenantWithOwner(db.adminClient, ownerBId, 'Nursery B');

    const { rows: childRows } = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Noor', 'she') returning id`,
      [tenantAId],
    );
    const childId = childRows[0].id;

    const { rows: storyRows } = await db.adminClient.query(
      `insert into stories (tenant_id, child_id, theme_key, locale, status, avatar_config_snapshot)
       values ($1, $2, 'bedtime_adventure', 'en', 'APPROVED', '{}'::jsonb) returning id`,
      [tenantAId, childId],
    );
    approvedStoryId = storyRows[0].id;
  }, 60_000);

  afterAll(async () => db.teardown());

  function validOrderInsert(tenantId: string, storyId: string, requestedBy: string) {
    return {
      text: `insert into print_orders
        (tenant_id, story_id, requested_by, status, currency, amount_minor,
         shipping_name, shipping_phone, shipping_address_line1, shipping_city,
         shipping_country, consent_accepted_at)
        values ($1, $2, $3, 'pending', 'usd', 2900,
                'Jane Parent', '+971500000000', '123 Palm Street', 'Dubai',
                'AE', now())
        returning id`,
      values: [tenantId, storyId, requestedBy],
    };
  }

  it('lets a tenant member create a pending print order for their own story', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const { text, values } = validOrderInsert(tenantAId, approvedStoryId, ownerAId);
    const { rows } = await client.query(text, values);
    expect(rows).toHaveLength(1);
    await client.end();
  });

  it('rejects inserting a print order with a non-pending status', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    await expect(
      client.query(
        `insert into print_orders
          (tenant_id, story_id, requested_by, status, currency, amount_minor,
           shipping_name, shipping_phone, shipping_address_line1, shipping_city,
           shipping_country, consent_accepted_at)
          values ($1, $2, $3, 'paid', 'usd', 2900,
                  'Jane Parent', '+971500000000', '123 Palm Street', 'Dubai',
                  'AE', now())`,
        [tenantAId, approvedStoryId, ownerAId],
      ),
    ).rejects.toThrow();
    await client.end();
  });

  it('does not let a different tenant see tenant A print orders', async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const { rows } = await clientB.query('select id from print_orders where tenant_id = $1', [tenantAId]);
    expect(rows).toHaveLength(0);
    await clientB.end();
  });

  it('does not let a different tenant insert a print order against another tenant\'s story', async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const { text, values } = validOrderInsert(tenantAId, approvedStoryId, ownerBId);
    await expect(clientB.query(text, values)).rejects.toThrow();
    await clientB.end();
  });

  it('does not let an authenticated tenant member update a print order directly (no update policy)', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const { text, values } = validOrderInsert(tenantAId, approvedStoryId, ownerAId);
    const { rows } = await client.query(text, values);
    const orderId = rows[0].id;

    await client.query(`update print_orders set status = 'paid' where id = $1`, [orderId]);
    const { rows: after } = await client.query('select status from print_orders where id = $1', [orderId]);
    // RLS silently filters out the update (no matching row under the
    // missing UPDATE policy) rather than erroring -- same behaviour as
    // Postgres RLS everywhere else in this schema that has no write
    // policy for a role. Status must still read 'pending'.
    expect(after[0].status).toBe('pending');
    await client.end();
  });

  it('lets the service role (webhook path) advance a print order to paid', async () => {
    // Same stand-in db.adminClient already uses for `service_role` writes
    // elsewhere in this suite (see stripe-webhook-idempotency.test.ts) --
    // this local fixture doesn't replicate Supabase's real project-level
    // default grants for service_role (99_grants.sql only covers
    // anon/authenticated), only its RLS-bypass attribute, so a raw table
    // write as the `service_role` Postgres role here would hit a plain
    // permission error that the real deployment never would.
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const { text, values } = validOrderInsert(tenantAId, approvedStoryId, ownerAId);
    const { rows } = await client.query(text, values);
    const orderId = rows[0].id;
    await client.end();

    await db.adminClient.query(
      `update print_orders set status = 'paid', stripe_payment_intent_id = $2 where id = $1 and status = 'pending'`,
      [orderId, 'pi_test_123'],
    );
    const { rows: after } = await db.adminClient.query(
      'select status, stripe_payment_intent_id from print_orders where id = $1',
      [orderId],
    );
    expect(after[0].status).toBe('paid');
    expect(after[0].stripe_payment_intent_id).toBe('pi_test_123');
  });
});
