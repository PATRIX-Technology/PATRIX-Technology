import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

describe('story approval workflow', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;
  let childId: string;
  let storyId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Nursery');
    const child = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Maya', 'she') returning id`,
      [tenantId],
    );
    childId = child.rows[0].id;

    const story = await db.adminClient.query(
      `insert into stories (tenant_id, child_id, theme_key, locale, status, avatar_config_snapshot)
       values ($1, $2, 'healthy_eating', 'en', 'NEEDS_REVIEW', '{}'::jsonb) returning id`,
      [tenantId, childId],
    );
    storyId = story.rows[0].id;

    await db.adminClient.query(
      `insert into story_pages (story_id, page_number, text, image_prompt, image_status)
       values ($1, 1, 'Page one', 'prompt one', 'PENDING'),
              ($1, 2, 'Page two', 'prompt two', 'PENDING')`,
      [storyId],
    );
  }, 60_000);

  afterAll(async () => db.teardown());

  it('refuses to approve a story while pages are not fully generated', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(client.query('select approve_story($1)', [storyId])).rejects.toThrow(
      /not fully generated/i,
    );
    await client.end();
  });

  it('approves once every page is GENERATED, stamping approver + timestamp', async () => {
    await db.adminClient.query(`update story_pages set image_status = 'GENERATED' where story_id = $1`, [
      storyId,
    ]);

    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await client.query('select approve_story($1)', [storyId]);
    await client.end();

    const { rows } = await db.adminClient.query(
      'select status, approved_by, approved_at from stories where id = $1',
      [storyId],
    );
    expect(rows[0].status).toBe('APPROVED');
    expect(rows[0].approved_by).toBe(ownerId);
    expect(rows[0].approved_at).not.toBeNull();
  });

  it('does not let staff from another tenant approve this story', async () => {
    const otherOwnerId = await createUser(db.adminClient, 'Other Owner');
    await createTenantWithOwner(db.adminClient, otherOwnerId, 'Other Nursery');

    const otherClient = await db.connectAs({ role: 'authenticated', userId: otherOwnerId });
    await expect(otherClient.query('select reject_story($1, $2)', [storyId, 'not mine'])).rejects.toThrow(
      /not authorized/i,
    );
    await otherClient.end();
  });
});

describe('Arabic native-review gating on templates', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDatabase();
    await db.adminClient.query(
      `insert into story_theme_templates (theme_key, locale, title, synopsis, pages, native_review_status)
       values
        ('honesty', 'ar', 'test', 'test', '[]'::jsonb, 'draft'),
        ('honesty', 'en', 'test', 'test', '[]'::jsonb, 'reviewed')`,
    );
  }, 60_000);

  afterAll(async () => db.teardown());

  it('every seeded Arabic row defaults to draft, every English row to reviewed', async () => {
    const { rows } = await db.adminClient.query(
      `select locale, native_review_status from story_theme_templates where theme_key = 'honesty'`,
    );
    const ar = rows.find((r: { locale: string }) => r.locale === 'ar');
    const en = rows.find((r: { locale: string }) => r.locale === 'en');
    expect(ar.native_review_status).toBe('draft');
    expect(en.native_review_status).toBe('reviewed');
  });

  it('only the platform owner can flip a template to reviewed', async () => {
    const nurseryOwnerId = await createUser(db.adminClient, 'Nursery Owner');
    const client = await db.connectAs({ role: 'authenticated', userId: nurseryOwnerId });

    const { rowCount } = await client.query(
      `update story_theme_templates set native_review_status = 'reviewed' where theme_key = 'honesty' and locale = 'ar'`,
    );
    expect(rowCount).toBe(0);
    await client.end();

    const platformOwnerId = await createUser(db.adminClient, 'Platform Owner');
    await db.adminClient.query('update profiles set is_platform_owner = true where id = $1', [
      platformOwnerId,
    ]);
    const ownerClient = await db.connectAs({ role: 'authenticated', userId: platformOwnerId });
    await ownerClient.query(
      `update story_theme_templates set native_review_status = 'reviewed' where theme_key = 'honesty' and locale = 'ar'`,
    );
    await ownerClient.end();

    const { rows } = await db.adminClient.query(
      `select native_review_status from story_theme_templates where theme_key = 'honesty' and locale = 'ar'`,
    );
    expect(rows[0].native_review_status).toBe('reviewed');
  });
});
