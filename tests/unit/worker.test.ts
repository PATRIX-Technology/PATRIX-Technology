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

/** Minimal fake Supabase client covering exactly the surface worker.ts uses. */
function createFakeSupabase(overrides: {
  jobs: unknown[];
  pageRow?: Record<string, unknown>;
  remainingCount?: number;
}) {
  let jobIndex = 0;
  const updates: { table: string; payload: unknown }[] = [];

  const client = {
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'claim_next_story_job') {
        const job = overrides.jobs[jobIndex] ?? null;
        jobIndex += 1;
        return { data: job, error: null };
      }
      throw new Error(`Unexpected rpc ${fn}`);
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: async () => ({ data: overrides.pageRow, error: null }),
          neq: vi.fn(() => ({ count: overrides.remainingCount ?? 0 })),
        })),
      })),
      update: vi.fn((payload: unknown) => {
        updates.push({ table, payload });
        return { eq: vi.fn(async () => ({ data: null, error: null })) };
      }),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
      })),
    },
  };

  return { client, updates };
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
      pageRow: { image_prompt: 'a fox', stories: { tenant_id: 'tenant-1' } },
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
});
