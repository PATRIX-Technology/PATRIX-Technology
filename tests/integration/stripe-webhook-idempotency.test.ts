import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDb } from './db/setup';

/**
 * Proves the actual DB-level guarantee the webhook route
 * (src/app/api/billing/webhook/route.ts) relies on: inserting the same
 * Stripe event id twice hits the stripe_webhook_events primary key and
 * fails with a unique-violation (Postgres error code 23505) rather than
 * silently succeeding — this is what the route checks to treat a retried
 * delivery as a no-op instead of double-applying a subscription change.
 */
describe('stripe_webhook_events idempotency', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);

  afterAll(async () => db.teardown());

  it('accepts the first delivery of a given event id', async () => {
    await db.adminClient.query(
      `insert into stripe_webhook_events (stripe_event_id, event_type) values ($1, $2)`,
      ['evt_test_1', 'checkout.session.completed'],
    );
    const { rows } = await db.adminClient.query(
      `select event_type from stripe_webhook_events where stripe_event_id = $1`,
      ['evt_test_1'],
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects a duplicate delivery of the same event id with a unique-violation', async () => {
    await db.adminClient.query(
      `insert into stripe_webhook_events (stripe_event_id, event_type) values ($1, $2)`,
      ['evt_test_2', 'customer.subscription.updated'],
    );

    await expect(
      db.adminClient.query(`insert into stripe_webhook_events (stripe_event_id, event_type) values ($1, $2)`, [
        'evt_test_2',
        'customer.subscription.updated',
      ]),
    ).rejects.toMatchObject({ code: '23505' });

    const { rows } = await db.adminClient.query(
      `select count(*)::int as count from stripe_webhook_events where stripe_event_id = $1`,
      ['evt_test_2'],
    );
    expect(rows[0].count).toBe(1);
  });

  it('allows different event ids to be recorded independently', async () => {
    await db.adminClient.query(`insert into stripe_webhook_events (stripe_event_id, event_type) values ($1, $2)`, [
      'evt_test_3a',
      'invoice.payment_failed',
    ]);
    await db.adminClient.query(`insert into stripe_webhook_events (stripe_event_id, event_type) values ($1, $2)`, [
      'evt_test_3b',
      'invoice.payment_failed',
    ]);

    const { rows } = await db.adminClient.query(
      `select count(*)::int as count from stripe_webhook_events where stripe_event_id in ('evt_test_3a', 'evt_test_3b')`,
    );
    expect(rows[0].count).toBe(2);
  });

  it('clients (not just the service role) cannot write to stripe_webhook_events — no RLS policy grants it', async () => {
    const anonClient = await db.connectAs({ role: 'anon' });
    await expect(
      anonClient.query(`insert into stripe_webhook_events (stripe_event_id, event_type) values ($1, $2)`, [
        'evt_forged',
        'checkout.session.completed',
      ]),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await anonClient.end();
  });
});
