import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * Regression test for a real bug caught during a security review of this
 * branch: story_jobs originally had only a SELECT RLS policy, but
 * src/lib/domain/stories.ts (createStory) and
 * src/lib/actions/stories.ts (regeneratePageAction) both insert into
 * story_jobs using the regular authenticated client, not the service
 * role. Against a real Supabase project this would have made every story
 * creation and every page regeneration fail outright with a row-level
 * security violation the moment a real nursery tried to use the product
 * — caught here, before that ever happened, by testing the actual insert
 * path against real RLS rather than a mocked Supabase client. See
 * supabase/migrations/0003_templates_stories.sql "story_jobs_insert_via_story".
 */
describe('story_jobs RLS (queueing a generation job)', () => {
  let db: TestDb;
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let ownerBId: string;
  let storyAId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerAId = await createUser(db.adminClient, 'Owner A');
    ownerBId = await createUser(db.adminClient, 'Owner B');
    tenantAId = await createTenantWithOwner(db.adminClient, ownerAId, 'Nursery A');
    tenantBId = await createTenantWithOwner(db.adminClient, ownerBId, 'Nursery B');

    const child = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun) values ($1, 'Maya', 'she') returning id`,
      [tenantAId],
    );
    const story = await db.adminClient.query(
      `insert into stories (tenant_id, child_id, theme_key, locale, status, avatar_config_snapshot)
       values ($1, $2, 'healthy_eating', 'en', 'QUEUED', '{}'::jsonb) returning id`,
      [tenantAId, child.rows[0].id],
    );
    storyAId = story.rows[0].id;
  }, 60_000);

  afterAll(async () => db.teardown());

  it('lets a tenant member enqueue a GENERATE_PAGE_IMAGE job for their own story', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const result = await client.query(
      `insert into story_jobs (story_id, job_type) values ($1, 'GENERATE_PAGE_IMAGE') returning id`,
      [storyAId],
    );
    expect(result.rows).toHaveLength(1);
    await client.end();
  });

  it('blocks a different tenant from enqueueing a job against a story that is not theirs', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerBId });
    await expect(
      client.query(`insert into story_jobs (story_id, job_type) values ($1, 'GENERATE_PAGE_IMAGE')`, [storyAId]),
    ).rejects.toThrow(/row-level security/i);
    await client.end();
  });

  it('blocks an anonymous client from enqueueing a job at all', async () => {
    const client = await db.connectAs({ role: 'anon' });
    await expect(
      client.query(`insert into story_jobs (story_id, job_type) values ($1, 'GENERATE_PAGE_IMAGE')`, [storyAId]),
    ).rejects.toThrow(/row-level security/i);
    await client.end();
  });

  it('still blocks a tenant member from updating a job directly (only the service-role worker may)', async () => {
    const insert = await db.adminClient.query(
      `insert into story_jobs (story_id, job_type) values ($1, 'GENERATE_PAGE_IMAGE') returning id`,
      [storyAId],
    );
    const jobId = insert.rows[0].id;

    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    const result = await client.query(`update story_jobs set status = 'SUCCEEDED' where id = $1`, [jobId]);
    expect(result.rowCount).toBe(0);
    await client.end();

    const check = await db.adminClient.query('select status from story_jobs where id = $1', [jobId]);
    expect(check.rows[0].status).toBe('QUEUED');
  });
});
