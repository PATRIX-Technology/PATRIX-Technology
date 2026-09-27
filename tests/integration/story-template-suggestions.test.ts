import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * Story-idea suggestions from the Stories page — see docs/DECISIONS.md
 * "Story template suggestions". Low-risk table (plain RLS policies, no
 * SECURITY DEFINER RPC), but tenant isolation on a new table is exactly
 * the kind of thing that's easy to get wrong once and never notice.
 */
describe('story_template_suggestions (RLS)', () => {
  let db: TestDb;
  let ownerAId: string;
  let ownerBId: string;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerAId = await createUser(db.adminClient, 'Nursery A Owner');
    ownerBId = await createUser(db.adminClient, 'Nursery B Owner');
    tenantAId = await createTenantWithOwner(db.adminClient, ownerAId, 'Nursery A');
    tenantBId = await createTenantWithOwner(db.adminClient, ownerBId, 'Nursery B');
  }, 60_000);

  afterAll(async () => db.teardown());

  it('lets a tenant member insert a suggestion for their own tenant', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    await client.query(
      `insert into story_template_suggestions (tenant_id, submitted_by, topic, description)
       values ($1, $2, 'Recycling', 'We want kids to learn to sort waste at home.')`,
      [tenantAId, ownerAId],
    );
    const { rows } = await client.query(
      'select topic, status from story_template_suggestions where tenant_id = $1',
      [tenantAId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe('Recycling');
    expect(rows[0].status).toBe('new');
    await client.end();
  });

  it('refuses an insert claiming another tenant_id', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    await expect(
      client.query(
        `insert into story_template_suggestions (tenant_id, submitted_by, topic, description)
         values ($1, $2, 'Sneaky', 'Should not be allowed.')`,
        [tenantBId, ownerAId],
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await client.end();
  });

  it('refuses an insert claiming someone else as the submitter', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    await expect(
      client.query(
        `insert into story_template_suggestions (tenant_id, submitted_by, topic, description)
         values ($1, $2, 'Impersonation', 'Should not be allowed.')`,
        [tenantAId, ownerBId],
      ),
    ).rejects.toThrow(/row-level security|permission denied/i);
    await client.end();
  });

  it("hides tenant A's suggestions from tenant B entirely", async () => {
    const clientB = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    const { rows } = await clientB.query(
      'select id from story_template_suggestions where tenant_id = $1',
      [tenantAId],
    );
    expect(rows).toHaveLength(0);
    await clientB.end();
  });

  it('lets the platform owner see and update suggestions across every tenant', async () => {
    const ownerUserId = await createUser(db.adminClient, 'Platform Owner');
    await db.adminClient.query('update profiles set is_platform_owner = true where id = $1', [ownerUserId]);

    const ownerClient = await db.connectAs({ role: 'authenticated', userId: ownerUserId });
    const { rows } = await ownerClient.query(
      'select id, status from story_template_suggestions where tenant_id = $1',
      [tenantAId],
    );
    expect(rows).toHaveLength(1);

    await ownerClient.query("update story_template_suggestions set status = 'reviewed' where id = $1", [
      rows[0].id,
    ]);
    const after = await db.adminClient.query('select status from story_template_suggestions where id = $1', [
      rows[0].id,
    ]);
    expect(after.rows[0].status).toBe('reviewed');
    await ownerClient.end();
  });

  it('refuses a plain tenant member updating a suggestion\'s status themselves', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const { rows } = await client.query(
      'select id from story_template_suggestions where tenant_id = $1',
      [tenantAId],
    );
    await expect(
      client.query("update story_template_suggestions set status = 'added' where id = $1", [rows[0].id]),
    ).resolves.toMatchObject({ rowCount: 0 });

    const unchanged = await db.adminClient.query(
      'select status from story_template_suggestions where id = $1',
      [rows[0].id],
    );
    expect(unchanged.rows[0].status).toBe('reviewed');
    await client.end();
  });
});
