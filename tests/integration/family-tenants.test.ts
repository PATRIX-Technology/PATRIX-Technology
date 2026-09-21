import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, type TestDb } from './db/setup';

describe('family tenants (Phase 4 scaffolding)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);

  afterAll(async () => db.teardown());

  it('create_family_tenant creates a family-typed tenant, an owner membership, and a starter quota', async () => {
    const userId = await createUser(db.adminClient, 'Amina');
    const client = await db.connectAs({ role: 'authenticated', userId });

    const { rows } = await client.query(
      `select create_family_tenant($1, $2) as tenant_id`,
      ["Amina's Family", 'Amina'],
    );
    const tenantId = rows[0].tenant_id;
    await client.end();

    const tenant = await db.adminClient.query('select tenant_type from tenants where id = $1', [tenantId]);
    expect(tenant.rows[0].tenant_type).toBe('family');

    const membership = await db.adminClient.query(
      'select role from tenant_members where tenant_id = $1 and user_id = $2',
      [tenantId, userId],
    );
    expect(membership.rows[0].role).toBe('nursery_owner');

    const quota = await db.adminClient.query(
      'select stories_included_this_period from quotas where tenant_id = $1',
      [tenantId],
    );
    expect(quota.rows[0].stories_included_this_period).toBe(1);
  });

  it('auto-grants consent for a child added under a family tenant', async () => {
    const userId = await createUser(db.adminClient, 'Yusuf');
    const client = await db.connectAs({ role: 'authenticated', userId });
    const { rows } = await client.query(`select create_family_tenant($1, $2) as tenant_id`, [
      "Yusuf's Family",
      'Yusuf',
    ]);
    const tenantId = rows[0].tenant_id;

    const child = await client.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Layla', 'she') returning consent_status`,
      [tenantId],
    );
    expect(child.rows[0].consent_status).toBe('granted');
    await client.end();
  });

  it('does NOT auto-grant consent for a child added under a nursery tenant (trigger is a no-op there)', async () => {
    const userId = await createUser(db.adminClient, 'Nursery Owner');
    const client = await db.connectAs({ role: 'authenticated', userId });
    const { rows } = await client.query(`select create_tenant($1, $2, $3) as tenant_id`, [
      'Test Nursery',
      `test-nursery-${userId.slice(0, 8)}`,
      'Nursery Owner',
    ]);
    const tenantId = rows[0].tenant_id;

    const child = await client.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Omar', 'he') returning consent_status`,
      [tenantId],
    );
    expect(child.rows[0].consent_status).toBe('not_requested');
    await client.end();
  });

  it('a family tenant is isolated from another family tenant exactly like a nursery is', async () => {
    const ownerAId = await createUser(db.adminClient, 'Family A Owner');
    const clientA = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const tenantARow = await clientA.query(`select create_family_tenant($1, $2) as tenant_id`, [
      'Family A',
      'Owner A',
    ]);
    const tenantAId = tenantARow.rows[0].tenant_id;
    await clientA.query(`insert into children (tenant_id, first_name, pronoun) values ($1, 'Kid A', 'they')`, [
      tenantAId,
    ]);
    await clientA.end();

    const ownerBId = await createUser(db.adminClient, 'Family B Owner');
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const { rows } = await clientB.query('select id from children where tenant_id = $1', [tenantAId]);
    expect(rows).toHaveLength(0);
    await clientB.end();
  });
});
