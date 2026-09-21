import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * The single most important property of this platform: a nursery must
 * NEVER be able to see or modify another nursery's data. This runs
 * against a real Postgres instance with our actual RLS policies applied
 * (see tests/integration/db/setup.ts) — not a mock — so it proves the
 * database itself enforces isolation, not just the application code.
 */
describe('tenant isolation (RLS)', () => {
  let db: TestDb;
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let ownerBId: string;
  let childInTenantAId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerAId = await createUser(db.adminClient, 'Owner A');
    ownerBId = await createUser(db.adminClient, 'Owner B');
    tenantAId = await createTenantWithOwner(db.adminClient, ownerAId, 'Nursery A');
    tenantBId = await createTenantWithOwner(db.adminClient, ownerBId, 'Nursery B');

    const { rows } = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Maya', 'she') returning id`,
      [tenantAId],
    );
    childInTenantAId = rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await db.teardown();
  });

  it('lets an owner see their own tenant', async () => {
    const clientA = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const { rows } = await clientA.query('select id from tenants where id = $1', [tenantAId]);
    expect(rows).toHaveLength(1);
    await clientA.end();
  });

  it('hides tenant B from owner A entirely (no row returned, not an error)', async () => {
    const clientA = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const { rows } = await clientA.query('select id from tenants where id = $1', [tenantBId]);
    expect(rows).toHaveLength(0);
    await clientA.end();
  });

  it("hides tenant A's children from owner B", async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const { rows } = await clientB.query('select id from children where tenant_id = $1', [tenantAId]);
    expect(rows).toHaveLength(0);
    await clientB.end();
  });

  it('blocks owner B from inserting a child into tenant A', async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    // RLS with_check silently returns 0 affected rows rather than a thrown
    // error for INSERT ... SELECT-shaped statements, but a plain INSERT
    // violating WITH CHECK raises a policy violation — assert on that.
    await expect(
      clientB.query(
        `insert into children (tenant_id, first_name, pronoun) values ($1, 'Intruder', 'they')`,
        [tenantAId],
      ),
    ).rejects.toThrow(/row-level security/i);
    await clientB.end();
  });

  it("blocks owner B from updating tenant A's child", async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const result = await clientB.query(`update children set first_name = 'Hacked' where id = $1`, [
      childInTenantAId,
    ]);
    expect(result.rowCount).toBe(0);

    const check = await db.adminClient.query('select first_name from children where id = $1', [
      childInTenantAId,
    ]);
    expect(check.rows[0].first_name).toBe('Maya');
    await clientB.end();
  });

  it("blocks owner B from deleting tenant A's child", async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const result = await clientB.query('delete from children where id = $1', [childInTenantAId]);
    expect(result.rowCount).toBe(0);
    await clientB.end();
  });

  it('blocks an anonymous (logged-out) client from reading any children', async () => {
    const anonClient = await db.connectAs({ role: 'anon' });
    const { rows } = await anonClient.query('select id from children');
    expect(rows).toHaveLength(0);
    await anonClient.end();
  });

  it('lets the platform owner (support role) see across tenants', async () => {
    const platformOwnerId = await createUser(db.adminClient, 'Platform Support');
    await db.adminClient.query('update profiles set is_platform_owner = true where id = $1', [
      platformOwnerId,
    ]);

    const client = await db.connectAs({ role: 'authenticated', userId: platformOwnerId });
    const { rows } = await client.query('select id from tenants');
    const ids = rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(tenantAId);
    expect(ids).toContain(tenantBId);
    await client.end();
  });

  it('staff members cannot be added to a tenant by a non-owner in another tenant', async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    await expect(
      clientB.query(
        `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'nursery_staff')`,
        [tenantAId, ownerBId],
      ),
    ).rejects.toThrow(/row-level security/i);
    await clientB.end();
  });
});
