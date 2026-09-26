import { describe, expect, it, vi } from 'vitest';
import { backoffSeconds, runWorkerOnce } from '@/lib/jobs/worker';

describe('backoffSeconds', () => {
  it('grows exponentially: 30s, 2m, 8m, 32m', () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(3)).toBe(480);
    expect(backoffSeconds(4)).toBe(1920);
  });
});

/**
 * Minimal fake Supabase client covering exactly the surface worker.ts uses.
 * `story_pages`/`children` selects branch on which columns were requested,
 * since generatePageImage now issues several differently-shaped queries
 * against the same tables (the initial page fetch, the reference-photo
 * lookup, the earliest-generated-page lookup, and the remaining-count
 * check) — see fetchChildReferencePhoto / fetchEarliestGeneratedPageImage
 * in src/lib/jobs/worker.ts.
 */
function createFakeSupabase(overrides: {
  jobs: unknown[];
  pageRow?: Record<string, unknown>;
  remainingCount?: number;
  childPhotoAssetPath?: string | null;
  earliestPageImagePath?: string | null;
}) {
  let jobIndex = 0;
  const updates: { table: string; payload: unknown }[] = [];
  const events: string[] = [];

  const client = {
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'claim_next_story_job') {
        const job = overrides.jobs[jobIndex] ?? null;
        jobIndex += 1;
        return { data: job, error: null };
      }
      if (fn === 'reclaim_stale_story_jobs') {
        return { data: 0, error: null };
      }
      throw new Error(`Unexpected rpc ${fn}`);
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        if (table === 'story_pages' && columns === 'id, page_number') {
          return {
            in: vi.fn(async (_col: string, ids: string[]) => ({
              data: ids.map((id, i) => ({ id, page_number: i + 1 })),
              error: null,
            })),
          };
        }
        if (table === 'children') {
          return {
            eq: vi.fn(() => ({
              maybeSingle: async () => ({
                data: overrides.childPhotoAssetPath
                  ? { photo_asset_path: overrides.childPhotoAssetPath }
                  : null,
                error: null,
              }),
            })),
          };
        }
        if (table === 'story_pages' && columns === 'image_asset_path') {
          return {
            eq: vi.fn((_col: string, storyId: string) => {
              events.push(`lookup-earliest:${storyId}`);
              return {
                eq: vi.fn(() => ({
                  not: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: async () => ({
                          data: overrides.earliestPageImagePath
                            ? { image_asset_path: overrides.earliestPageImagePath }
                            : null,
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              };
            }),
          };
        }
        if (table === 'story_pages' && columns === 'id') {
          return {
            eq: vi.fn(() => ({
              neq: vi.fn(() => ({ count: overrides.remainingCount ?? 0 })),
            })),
          };
        }
        return {
          eq: vi.fn(() => ({
            single: async () => ({ data: overrides.pageRow, error: null }),
          })),
        };
      }),
      update: vi.fn((payload: unknown) => {
        updates.push({ table, payload });
        if (table === 'story_pages' && (payload as { image_status?: string }).image_status === 'GENERATED') {
          events.push('generated');
        }
        return { eq: vi.fn(async () => ({ data: null, error: null })) };
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        download: vi.fn(async () => ({ data: null, error: null })),
      })),
    },
  };

  return { client, updates, events };
}

describe('runWorkerOnce', () => {
  it('does nothing and reports zero when the queue is empty', async () => {
    const { client } = createFakeSupabase({ jobs: [] });
    const result = await runWorkerOnce(client as never);
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, retried: 0 });
  });

  it('successfully generates a page image with the mock provider and marks the story ready for review', async () => {
    const job = {
      id: 'job-1',
      story_id: 'story-1',
      page_id: 'page-1',
      job_type: 'GENERATE_PAGE_IMAGE',
      status: 'RUNNING',
      attempts: 0,
      max_attempts: 4,
    };
    const { client, updates } = createFakeSupabase({
      jobs: [job],
      pageRow: { image_prompt: 'a fox', text: 'A fox in a garden.', stories: { tenant_id: 'tenant-1', locale: 'en' } },
      remainingCount: 0,
    });

    const result = await runWorkerOnce(client as never);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    const storyUpdate = updates.find((u) => u.table === 'stories');
    expect(storyUpdate?.payload).toMatchObject({ status: 'NEEDS_REVIEW' });

    const jobUpdate = updates.find((u) => u.table === 'story_jobs');
    expect(jobUpdate?.payload).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('generates a story\'s page 1 before its later pages, so they can reference it', async () => {
    // Both jobs belong to the same story; the fake page_number lookup
    // (see createFakeSupabase) assigns them 1 and 2 in claim order. If
    // runWorkerOnce still ran every claimed job in one flat Promise.all,
    // page 2's reference-image lookup would race page 1's GENERATED
    // update instead of reliably following it.
    const jobs = [
      { id: 'job-1', story_id: 'story-1', page_id: 'page-1', job_type: 'GENERATE_PAGE_IMAGE', status: 'RUNNING', attempts: 0, max_attempts: 4 },
      { id: 'job-2', story_id: 'story-1', page_id: 'page-2', job_type: 'GENERATE_PAGE_IMAGE', status: 'RUNNING', attempts: 0, max_attempts: 4 },
    ];
    const { client, events } = createFakeSupabase({
      jobs,
      pageRow: { image_prompt: 'a fox', text: 'A fox in a garden.', stories: { tenant_id: 'tenant-1', locale: 'en' } },
      remainingCount: 0,
    });

    const result = await runWorkerOnce(client as never);
    expect(result.succeeded).toBe(2);

    // Page 1 has nothing to reference yet, so it looks up "earliest
    // generated page" first (finds none), generates, and is marked
    // GENERATED - only then does page 2 run its own lookup.
    const firstGenerated = events.indexOf('generated');
    const secondLookup = events.indexOf('lookup-earliest:story-1', firstGenerated + 1);
    expect(firstGenerated).toBeGreaterThanOrEqual(0);
    expect(secondLookup).toBeGreaterThan(firstGenerated);
  });
});
