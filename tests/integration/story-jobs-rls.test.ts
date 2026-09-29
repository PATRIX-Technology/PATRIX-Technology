import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * story_jobs RLS. Originally this table had a client-facing INSERT policy
 * (story_jobs_insert_via_story) because createStory()/regeneratePageAction
 * inserted directly using the regular authenticated client. Migration
 * 0030 dropped that policy: a later security audit found a tenant member
 * could exploit the same direct-insert path to queue a job with an
 * arbitrary image_prompt, a real cost/abuse vector, so story creation and
 * page regeneration now go through the create_story/regenerate_story_page
 * SECURITY DEFINER RPCs instead (src/lib/domain/stories.ts,
 * src/lib/actions/stories.ts) — no client role has any direct write path
 * into this table any more. See docs/DECISIONS.md "Full QA + security
 * pass, and two critical privilege-escalation holes".
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

  it('blocks a tenant member from enqueueing a job directly, even for their own story (must go through create_story/regenerate_story_page)', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerAId });
    await expect(
      client.query(`insert into story_jobs (story_id, job_type) values ($1, 'GENERATE_PAGE_IMAGE')`, [storyAId]),
    ).rejects.toThrow(/row-level security/i);
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
