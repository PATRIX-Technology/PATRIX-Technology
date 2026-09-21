import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

describe('story-assets storage isolation', () => {
  let db: TestDb;
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let ownerBId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerAId = await createUser(db.adminClient, 'Owner A');
    ownerBId = await createUser(db.adminClient, 'Owner B');
    tenantAId = await createTenantWithOwner(db.adminClient, ownerAId, 'Nursery A');
    tenantBId = await createTenantWithOwner(db.adminClient, ownerBId, 'Nursery B');
    await db.adminClient.query(`insert into storage.buckets (id, name, public) values ('story-assets', 'story-assets', false) on conflict (id) do nothing`);
  }, 60_000);

  afterAll(async () => db.teardown());

  it('lets a tenant member insert and read their own object', async () => {
    const clientA = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    await clientA.query(
      `insert into storage.objects (bucket_id, name) values ('story-assets', $1)`,
      [`${tenantAId}/stories/story-1/pages/page-1.png`],
    );
    const { rows } = await clientA.query(
      `select name from storage.objects where bucket_id = 'story-assets'`,
    );
    expect(rows).toHaveLength(1);
    await clientA.end();
  });

  it('hides tenant A objects from tenant B', async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const { rows } = await clientB.query(
      `select name from storage.objects where bucket_id = 'story-assets' and name like $1`,
      [`${tenantAId}%`],
    );
    expect(rows).toHaveLength(0);
    await clientB.end();
  });

  it('blocks tenant B from inserting an object under tenant A\'s path', async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    await expect(
      clientB.query(`insert into storage.objects (bucket_id, name) values ('story-assets', $1)`, [
        `${tenantAId}/stories/intruder/pages/page-1.png`,
      ]),
    ).rejects.toThrow(/row-level security/i);
    await clientB.end();
  });

  it('blocks staff from deleting assets (only owner/admin/platform owner can)', async () => {
    await db.adminClient.query(
      `insert into tenant_members (tenant_id, user_id, role) values ($1, $2, 'nursery_staff')`,
      [tenantBId, await createUser(db.adminClient, 'Staffer')],
    );
    const { rows: staffRows } = await db.adminClient.query(
      `select user_id from tenant_members where tenant_id = $1 and role = 'nursery_staff'`,
      [tenantBId],
    );
    const staffId = staffRows[0].user_id;

    await db.adminClient.query(`insert into storage.objects (bucket_id, name) values ('story-assets', $1)`, [
      `${tenantBId}/stories/story-2/pages/page-1.png`,
    ]);

    const staffClient = await db.connectAs({ role: 'authenticated', userId: staffId });
    const result = await staffClient.query(
      `delete from storage.objects where bucket_id = 'story-assets' and name = $1`,
      [`${tenantBId}/stories/story-2/pages/page-1.png`],
    );
    expect(result.rowCount).toBe(0);
    await staffClient.end();
  });
});
