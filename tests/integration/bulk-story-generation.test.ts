import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createTenantWithOwner, createUser, type TestDb } from './db/setup';

/**
 * generateStoriesBulkAction (src/lib/actions/stories.ts, Phase E — see
 * docs/DECISIONS.md "Bulk story generation across the roster") loops
 * createStoryForTenant/create_story once per selected child and reports
 * each child's own success/failure rather than aborting the whole batch
 * on the first failure. That resilience depends entirely on create_story
 * itself enforcing quota atomically PER CALL — this proves that
 * mechanism against real Postgres (the RPC, consent trigger, and the
 * quotas table it writes to), not just that the bulk action's own loop
 * doesn't throw.
 */
describe('bulk story generation: quota-insufficient partial success', () => {
  let db: TestDb;
  let tenantId: string;
  let ownerId: string;
  let childIds: string[];

  beforeAll(async () => {
    db = await createTestDatabase();
    ownerId = await createUser(db.adminClient, 'Owner');
    tenantId = await createTenantWithOwner(db.adminClient, ownerId, 'Nursery');

    // Quota for exactly 2 stories this period -- 3 children will be
    // selected below, so the 3rd call must fail while the first 2
    // succeed.
    await db.adminClient.query(
      `insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period) values ($1, 2, 0)`,
      [tenantId],
    );

    const children = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun, consent_status)
       values ($1, 'Maya', 'she', 'granted'),
              ($1, 'Noor', 'she', 'granted'),
              ($1, 'Omar', 'he', 'granted')
       returning id`,
      [tenantId],
    );
    childIds = children.rows.map((r) => r.id as string);
  }, 60_000);

  afterAll(async () => db.teardown());

  it('creates stories for as many children as quota allows, failing only the rest', async () => {
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });

    const outcomes: Array<{ childId: string; ok: boolean; error?: string }> = [];
    for (const childId of childIds) {
      try {
        const { rows } = await client.query(
          `select create_story($1, $2, 'healthy_eating', 'en', '{}'::jsonb, 'she',
             '[{"page_number":1,"text":"Page one","image_prompt":"prompt one"}]'::jsonb) as story_id`,
          [tenantId, childId],
        );
        outcomes.push({ childId, ok: true, error: undefined });
        expect(rows[0].story_id).toBeTruthy();
      } catch (error) {
        outcomes.push({ childId, ok: false, error: (error as Error).message });
      }
    }
    await client.end();

    // Same per-row resilience generateStoriesBulkAction reports: the
    // first MAX_CSV_IMPORT_ROWS... no -- the first `stories_included`
    // children succeed in selection order, the rest fail with the exact
    // message createStoryForTenant pattern-matches into
    // QuotaExceededError.
    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
    expect(outcomes.filter((o) => !o.ok)).toHaveLength(1);
    expect(outcomes[2]!.ok).toBe(false);
    expect(outcomes[2]!.error).toMatch(/used all the stories/i);

    const { rows: quotaRows } = await db.adminClient.query(
      'select stories_used_this_period from quotas where tenant_id = $1',
      [tenantId],
    );
    expect(quotaRows[0].stories_used_this_period).toBe(2);

    const { rows: storyRows } = await db.adminClient.query(
      'select child_id from stories where tenant_id = $1 order by created_at',
      [tenantId],
    );
    expect(storyRows).toHaveLength(2);
    expect(storyRows.map((r) => r.child_id)).toEqual([childIds[0], childIds[1]]);
  });

  it('never creates a story for a child without granted consent, even with quota to spare', async () => {
    const noConsentChild = await db.adminClient.query(
      `insert into children (tenant_id, first_name, pronoun, consent_status) values ($1, 'Zayed', 'he', 'pending') returning id`,
      [tenantId],
    );
    const client = await db.connectAs({ role: 'authenticated', userId: ownerId });
    await expect(
      client.query(
        `select create_story($1, $2, 'healthy_eating', 'en', '{}'::jsonb, 'he',
           '[{"page_number":1,"text":"Page one","image_prompt":"prompt one"}]'::jsonb)`,
        [tenantId, noConsentChild.rows[0].id],
      ),
    ).rejects.toThrow(/granted consent/i);
    await client.end();
  });
});
