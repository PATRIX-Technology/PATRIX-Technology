import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function insertGift(
  db: TestDb,
  overrides: { codeHash: string; status?: string; storyCredits?: number },
) {
  const { rows } = await db.adminClient.query(
    `insert into gifts (purchaser_email, story_credits, amount_usd, code_hash, status)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      'purchaser@example.test',
      overrides.storyCredits ?? 3,
      39,
      overrides.codeHash,
      overrides.status ?? 'paid',
    ],
  );
  return rows[0].id as string;
}

describe('gift purchase + redemption (Phase 4 scaffolding)', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Recipient');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Recipient Family');
    await db.adminClient.query(
      `insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period) values ($1, 1, 0)`,
      [tenantId],
    );
  }, 60_000);

  afterAll(async () => db.teardown());

  it('get_gift_status is readable by an anonymous (unauthenticated) visitor', async () => {
    const rawCode = 'test-code-anon-lookup';
    await insertGift(db, { codeHash: sha256(rawCode) });

    const anonClient = await db.connectAs({ role: 'anon' });
    const { rows } = await anonClient.query('select (get_gift_status($1)).*', [rawCode]);
    expect(rows[0].found).toBe(true);
    expect(rows[0].status).toBe('paid');
    expect(rows[0].story_credits).toBe(3);
    await anonClient.end();
  });

  it('get_gift_status reports not found for an unknown code without erroring', async () => {
    const anonClient = await db.connectAs({ role: 'anon' });
    const { rows } = await anonClient.query('select (get_gift_status($1)).*', ['does-not-exist']);
    expect(rows[0].found).toBe(false);
    await anonClient.end();
  });

  it('redeeming a paid gift credits the tenant quota and marks it redeemed', async () => {
    const rawCode = 'test-code-redeem-success';
    await insertGift(db, { codeHash: sha256(rawCode), storyCredits: 4 });

    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    const { rows } = await client.query('select redeem_gift($1, $2) as credits_added', [rawCode, tenantId]);
    expect(rows[0].credits_added).toBe(4);
    await client.end();

    const quota = await db.adminClient.query(
      'select stories_included_this_period from quotas where tenant_id = $1',
      [tenantId],
    );
    expect(quota.rows[0].stories_included_this_period).toBe(5); // 1 starting + 4 redeemed

    const gift = await db.adminClient.query(
      'select status, redeemed_by_tenant_id from gifts where code_hash = $1',
      [sha256(rawCode)],
    );
    expect(gift.rows[0].status).toBe('redeemed');
    expect(gift.rows[0].redeemed_by_tenant_id).toBe(tenantId);
  });

  it('redeeming the same gift twice fails on the second attempt', async () => {
    const rawCode = 'test-code-double-redeem';
    await insertGift(db, { codeHash: sha256(rawCode) });

    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await client.query('select redeem_gift($1, $2)', [rawCode, tenantId]);
    await expect(client.query('select redeem_gift($1, $2)', [rawCode, tenantId])).rejects.toThrow(
      /already been redeemed/i,
    );
    await client.end();
  });

  it('refuses to redeem a gift that has not been paid yet', async () => {
    const rawCode = 'test-code-not-paid';
    await insertGift(db, { codeHash: sha256(rawCode), status: 'pending_payment' });

    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(client.query('select redeem_gift($1, $2)', [rawCode, tenantId])).rejects.toThrow(
      /not ready to redeem/i,
    );
    await client.end();
  });

  it('rejects an unknown gift code', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(client.query('select redeem_gift($1, $2)', ['nonexistent', tenantId])).rejects.toThrow(
      /not found/i,
    );
    await client.end();
  });

  it('does not let a user redeem a gift into a tenant they are not a member of', async () => {
    const rawCode = 'test-code-wrong-tenant';
    await insertGift(db, { codeHash: sha256(rawCode) });

    const outsiderId = await createUser(db.adminClient, 'Outsider');
    const client = await db.connectAs({ role: 'authenticated', userId: outsiderId });
    await expect(client.query('select redeem_gift($1, $2)', [rawCode, tenantId])).rejects.toThrow(
      /not authorized/i,
    );
    await client.end();
  });

  it('no client role can write directly to gifts — only the service role / SECURITY DEFINER RPCs can', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(
      client.query(
        `insert into gifts (purchaser_email, story_credits, amount_usd, status) values ($1, $2, $3, $4)`,
        ['forged@example.test', 100, 0, 'paid'],
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await client.end();
  });
});
