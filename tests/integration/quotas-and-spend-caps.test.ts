import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

describe('story quotas', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Nursery');
    await db.adminClient.query(
      `insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period) values ($1, 2, 0)`,
      [tenantId],
    );
  }, 60_000);

  afterAll(async () => db.teardown());

  it('allows generation while under quota and increments usage', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    const first = await client.query('select consume_story_quota($1) as ok', [tenantId]);
    expect(first.rows[0].ok).toBe(true);

    const second = await client.query('select consume_story_quota($1) as ok', [tenantId]);
    expect(second.rows[0].ok).toBe(true);
    await client.end();

    const { rows } = await db.adminClient.query(
      'select stories_used_this_period from quotas where tenant_id = $1',
      [tenantId],
    );
    expect(rows[0].stories_used_this_period).toBe(2);
  });

  it('physically blocks a third story once the hard cap is reached', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    const result = await client.query('select consume_story_quota($1) as ok', [tenantId]);
    expect(result.rows[0].ok).toBe(false);
    await client.end();

    const { rows } = await db.adminClient.query(
      'select stories_used_this_period from quotas where tenant_id = $1',
      [tenantId],
    );
    // Usage must NOT have incremented past the cap.
    expect(rows[0].stories_used_this_period).toBe(2);
  });

  it('does not let one tenant consume another tenant\'s quota', async () => {
    const otherOwnerId = await createUser(db.adminClient, 'Other Owner');
    const otherTenantId = await createTenantWithOwner(db.adminClient, otherOwnerId, 'Other Nursery');
    await db.adminClient.query(
      `insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period) values ($1, 5, 0)`,
      [otherTenantId],
    );

    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(client.query('select consume_story_quota($1)', [otherTenantId])).rejects.toThrow(
      /not authorized/i,
    );
    await client.end();
  });
});

describe('AI spend caps (hard kill switch)', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Nursery');
    await db.adminClient.query(
      `insert into tenant_spend_caps (tenant_id, monthly_cap_usd) values ($1, 1.00)`,
      [tenantId],
    );
    // Global kill switch defaults to true (off) — disable it so tenant-level
    // behaviour can be tested in isolation.
    await db.adminClient.query(
      `update global_spend_cap set kill_switch = false, monthly_cap_usd = 1000`,
    );
  }, 60_000);

  afterAll(async () => db.teardown());

  it('allows spend while under the tenant cap', async () => {
    const { rows } = await db.adminClient.query('select can_spend($1) as ok', [tenantId]);
    expect(rows[0].ok).toBe(true);
  });

  it('flips the tenant kill switch the instant cumulative spend reaches the cap', async () => {
    await db.adminClient.query(
      `select record_ai_spend($1, null, null, 'real', 0.60::numeric)`,
      [tenantId],
    );
    let check = await db.adminClient.query('select can_spend($1) as ok', [tenantId]);
    expect(check.rows[0].ok).toBe(true);

    await db.adminClient.query(
      `select record_ai_spend($1, null, null, 'real', 0.45::numeric)`,
      [tenantId],
    );
    check = await db.adminClient.query('select can_spend($1) as ok', [tenantId]);
    expect(check.rows[0].ok).toBe(false);

    const cap = await db.adminClient.query(
      'select kill_switch, current_period_spend_usd from tenant_spend_caps where tenant_id = $1',
      [tenantId],
    );
    expect(cap.rows[0].kill_switch).toBe(true);
    expect(Number(cap.rows[0].current_period_spend_usd)).toBeCloseTo(1.05, 2);
  });

  it('the global kill switch blocks spend even if the tenant cap has room', async () => {
    const otherOwnerId = await createUser(db.adminClient, 'Owner 2');
    const otherTenantId = await createTenantWithOwner(db.adminClient, otherOwnerId, 'Nursery 2');
    await db.adminClient.query(
      `insert into tenant_spend_caps (tenant_id, monthly_cap_usd) values ($1, 1000)`,
      [otherTenantId],
    );

    let check = await db.adminClient.query('select can_spend($1) as ok', [otherTenantId]);
    expect(check.rows[0].ok).toBe(true);

    await db.adminClient.query('update global_spend_cap set kill_switch = true');

    check = await db.adminClient.query('select can_spend($1) as ok', [otherTenantId]);
    expect(check.rows[0].ok).toBe(false);
  });

  it('defaults the global kill switch to ON (safe) for a freshly migrated database', async () => {
    const fresh = await createTestDatabase();
    const { rows } = await fresh.adminClient.query('select kill_switch from global_spend_cap');
    expect(rows[0].kill_switch).toBe(true);
    await fresh.teardown();
  });
});
