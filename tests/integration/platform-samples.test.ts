import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

describe('platform sample stories (replacing the free trial)', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;
  let childId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Sample Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Sample Nursery');
    const child = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Sara', 'she') returning id`,
      [tenantId],
    );
    childId = child.rows[0].id;
  }, 60_000);

  afterAll(async () => db.teardown());

  async function makeApprovedStory(themeKey: string, locale: 'en' | 'ar') {
    // A real story can never exist without a matching template row
    // (createStoryAction requires selecting one to create a story at
    // all), so seed one here to mirror that -- get_platform_sample_stories
    // inner-joins to it for the title/synopsis shown on the card.
    await db.adminClient.query(
      `insert into story_theme_templates (theme_key, locale, title, synopsis, pages)
       values ($1, $2, $3, 'A sample synopsis.', '[]'::jsonb)
       on conflict (theme_key, locale) do nothing`,
      [themeKey, locale, `${themeKey} title`],
    );

    const story = await db.adminClient.query(
      `insert into stories (tenant_id, child_id, theme_key, locale, status, avatar_config_snapshot)
       values ($1, $2, $3, $4, 'APPROVED', '{}'::jsonb) returning id`,
      [tenantId, childId, themeKey, locale],
    );
    const storyId = story.rows[0].id;
    await db.adminClient.query(
      `insert into story_pages (story_id, page_number, text, image_prompt, image_status, image_asset_path)
       values ($1, 1, 'Once upon a time', 'a fox', 'GENERATED', 'fake/path.png')`,
      [storyId],
    );
    return storyId;
  }

  it('is empty when no story is flagged', async () => {
    const { rows } = await db.adminClient.query('select * from get_platform_sample_stories()');
    expect(rows).toHaveLength(0);
  });

  it('returns a flagged story with its template title/synopsis and first page', async () => {
    const storyId = await makeApprovedStory('healthy_eating', 'en');
    await db.adminClient.query('update stories set is_platform_sample = true where id = $1', [storyId]);

    const { rows } = await db.adminClient.query('select * from get_platform_sample_stories()');
    expect(rows).toHaveLength(1);
    expect(rows[0].story_id).toBe(storyId);
    expect(rows[0].locale).toBe('en');
    expect(rows[0].theme_key).toBe('healthy_eating');
    expect(rows[0].title).toBeTruthy();
    expect(rows[0].synopsis).toBeTruthy();
    expect(rows[0].first_page_text).toBe('Once upon a time');
    expect(rows[0].first_page_image_asset_path).toBe('fake/path.png');
  });

  it('allows one english AND one arabic sample at the same time', async () => {
    const arStoryId = await makeApprovedStory('brushing_teeth', 'ar');
    await db.adminClient.query('update stories set is_platform_sample = true where id = $1', [arStoryId]);

    const { rows } = await db.adminClient.query('select locale from get_platform_sample_stories()');
    expect(rows.map((r: { locale: string }) => r.locale).sort()).toEqual(['ar', 'en']);
  });

  it('refuses a second sample in the same locale', async () => {
    const secondEnStoryId = await makeApprovedStory('honesty', 'en');
    await expect(
      db.adminClient.query('update stories set is_platform_sample = true where id = $1', [secondEnStoryId]),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('a signed-in user with no tenant of their own can still call the RPC', async () => {
    // The whole point: a brand-new family account, with no stories of
    // its own yet, still needs to see these samples -- this is why the
    // RPC is security definer rather than an RLS policy on `stories`.
    const otherUserId = await createUser(db.adminClient, 'Brand New Family Owner');
    const client = await db.connectAs({ role: 'authenticated', userId: otherUserId });
    const { rows } = await client.query('select * from get_platform_sample_stories()');
    expect(rows.length).toBeGreaterThan(0);
    await client.end();
  });
});
