import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * Proves the fix for a real gap: subscriptions.plan_id and
 * quotas.stories_included_this_period were two separate tables that
 * nothing connected -- a nursery paying for a plan would stay capped at
 * whatever their quota already held (1, from the free trial), unable to
 * use the plan they just bought. sync_quota_to_plan() (0016) is what the
 * checkout.session.completed webhook handler calls to fix that; this
 * proves the RPC itself does the right thing and that only service_role
 * can call it.
 */
describe('sync_quota_to_plan (Stripe checkout -> usable quota)', () => {
  let db: TestDb;
  let ownerId: string;
  let tenantId: string;
  let growthPlanId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Nursery Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Growth Nursery');

    const plan = await db.adminClient.query(
      `insert into plans (key, name, price_monthly_cents, price_annual_cents, stories_per_month)
       values ('growth', 'Growth', 129900, 1249000, 100)
       returning id`,
    );
    growthPlanId = plan.rows[0].id;

    // Simulate a tenant who has already used their one free trial story —
    // the case that would previously have left them stuck even after
    // paying, since nothing reset stories_included_this_period.
    await db.adminClient.query(
      `insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period)
       values ($1, 1, 1)`,
      [tenantId],
    );
  }, 60_000);

  afterAll(async () => db.teardown());

  it('gives the tenant the plan\'s full story allowance and resets usage for a fresh period', async () => {
    const periodStart = new Date('2026-01-01T00:00:00Z').toISOString();
    const periodEnd = new Date('2026-01-31T00:00:00Z').toISOString();

    const service = await db.connectAs({ role: 'service_role' });
    await service.query('select sync_quota_to_plan($1, $2, $3, $4)', [
      tenantId,
      growthPlanId,
      periodStart,
      periodEnd,
    ]);
    await service.end();

    const { rows } = await db.adminClient.query(
      `select stories_included_this_period, stories_used_this_period, period_start, period_end
       from quotas where tenant_id = $1`,
      [tenantId],
    );
    expect(rows[0].stories_included_this_period).toBe(100);
    expect(rows[0].stories_used_this_period).toBe(0);
    expect(new Date(rows[0].period_start).toISOString()).toBe(periodStart);
    expect(new Date(rows[0].period_end).toISOString()).toBe(periodEnd);

    // And the tenant can now actually generate up to the new allowance —
    // this is the end-to-end proof: a paying customer can use what they
    // paid for, not just that a number changed in a table.
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    const result = await client.query('select consume_story_quota($1) as ok', [tenantId]);
    expect(result.rows[0].ok).toBe(true);
    await client.end();
  });

  it('creates a quotas row from scratch if the tenant never generated a trial story', async () => {
    const freshOwnerId = await createUser(db.adminClient, 'Fresh Nursery Owner');
    const freshTenantId = await createTenantWithOwner(db.adminClient, freshOwnerId, 'Fresh Nursery');

    const service = await db.connectAs({ role: 'service_role' });
    await service.query('select sync_quota_to_plan($1, $2, now(), now() + interval \'30 days\')', [
      freshTenantId,
      growthPlanId,
    ]);
    await service.end();

    const { rows } = await db.adminClient.query(
      'select stories_included_this_period from quotas where tenant_id = $1',
      [freshTenantId],
    );
    expect(rows[0].stories_included_this_period).toBe(100);
  });

  it('rejects an unknown plan id rather than silently granting zero stories', async () => {
    const service = await db.connectAs({ role: 'service_role' });
    await expect(
      service.query('select sync_quota_to_plan($1, $2, now(), now() + interval \'30 days\')', [
        tenantId,
        '00000000-0000-0000-0000-000000000000',
      ]),
    ).rejects.toThrow(/Unknown plan/);
    await service.end();
  });

  it('a tenant cannot call this themselves — only service_role may', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(
      client.query('select sync_quota_to_plan($1, $2, now(), now() + interval \'30 days\')', [
        tenantId,
        growthPlanId,
      ]),
    ).rejects.toThrow(/permission denied/i);
    await client.end();
  });
});
