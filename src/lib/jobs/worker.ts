import type { SupabaseClient } from '@supabase/supabase-js';
import { createImageProvider } from '@/lib/providers/image/factory';
import { ImageGenerationError, SpendCapExceededError } from '@/lib/providers/image/ImageProvider';
import type { StoryJob } from '@/types/database';

const STORAGE_BUCKET = 'story-assets';

/** Exponential backoff: 30s, 2m, 8m, 32m (base 4, cap at 4 attempts by default). */
export function backoffSeconds(attempt: number): number {
  return 30 * 4 ** Math.max(0, attempt - 1);
}

export interface WorkerRunResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
}

/**
 * Processes as many due jobs as are queued, one at a time. Designed to be
 * invoked by a scheduled trigger (cron-hit API route, Supabase Edge
 * Function cron, or a long-running process in dev) rather than kept alive
 * as its own server — see docs/DECISIONS.md "Job queue implementation".
 */
export async function runWorkerOnce(supabase: SupabaseClient, maxJobs = 25): Promise<WorkerRunResult> {
  const result: WorkerRunResult = { processed: 0, succeeded: 0, failed: 0, retried: 0 };

  for (let i = 0; i < maxJobs; i++) {
    const { data: job, error } = await supabase.rpc('claim_next_story_job');
    if (error) throw error;
    if (!job) break;

    result.processed++;
    const outcome = await processJob(supabase, job as StoryJob);
    if (outcome === 'succeeded') result.succeeded++;
    else if (outcome === 'failed') result.failed++;
    else result.retried++;
  }

  return result;
}

async function processJob(
  supabase: SupabaseClient,
  job: StoryJob,
): Promise<'succeeded' | 'failed' | 'retried'> {
  try {
    if (job.job_type === 'GENERATE_PAGE_IMAGE') {
      await generatePageImage(supabase, job);
    } else if (job.job_type === 'RENDER_PDF') {
      await renderStoryPdf(supabase, job);
    }

    await supabase
      .from('story_jobs')
      .update({ status: 'SUCCEEDED', updated_at: new Date().toISOString() })
      .eq('id', job.id);
    return 'succeeded';
  } catch (error) {
    return handleJobFailure(supabase, job, error);
  }
}

async function handleJobFailure(
  supabase: SupabaseClient,
  job: StoryJob,
  error: unknown,
): Promise<'failed' | 'retried'> {
  const attempts = job.attempts + 1;
  const message = error instanceof Error ? error.message : String(error);
  const retryable = error instanceof ImageGenerationError ? error.retryable : true;
  const isSpendCapped = error instanceof SpendCapExceededError;

  if (job.page_id) {
    await supabase
      .from('story_pages')
      .update({ attempts, last_error: message, image_status: 'FAILED' })
      .eq('id', job.page_id);
  }

  if (isSpendCapped || !retryable || attempts >= job.max_attempts) {
    await supabase
      .from('story_jobs')
      .update({ status: 'FAILED', attempts, last_error: message, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    await supabase
      .from('stories')
      .update({ status: 'FAILED' })
      .eq('id', job.story_id);

    return 'failed';
  }

  const nextRetryAt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
  await supabase
    .from('story_jobs')
    .update({
      status: 'QUEUED',
      attempts,
      last_error: message,
      next_retry_at: nextRetryAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  return 'retried';
}

async function generatePageImage(supabase: SupabaseClient, job: StoryJob): Promise<void> {
  if (!job.page_id) throw new Error('GENERATE_PAGE_IMAGE job is missing page_id');

  const { data: page, error: pageError } = await supabase
    .from('story_pages')
    .select('*, stories!inner(tenant_id, status)')
    .eq('id', job.page_id)
    .single();
  if (pageError) throw pageError;

  await supabase
    .from('story_pages')
    .update({ image_status: 'GENERATING' })
    .eq('id', job.page_id);

  const provider = createImageProvider(supabase);
  const result = await provider.generate({
    tenantId: page.stories.tenant_id,
    storyId: job.story_id,
    pageId: job.page_id,
    prompt: page.image_prompt,
    avatarConfig: {},
  });

  const extension = result.contentType === 'image/svg+xml' ? 'svg' : 'png';
  const assetPath = `${page.stories.tenant_id}/stories/${job.story_id}/pages/${job.page_id}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(assetPath, result.bytes, { contentType: result.contentType, upsert: true });
  if (uploadError) throw uploadError;

  await supabase
    .from('story_pages')
    .update({
      image_status: 'GENERATED',
      image_asset_path: assetPath,
      provider: result.provider,
      cost_usd: result.costUsd,
    })
    .eq('id', job.page_id);

  const { count: remaining } = await supabase
    .from('story_pages')
    .select('id', { count: 'exact', head: true })
    .eq('story_id', job.story_id)
    .neq('image_status', 'GENERATED');

  if ((remaining ?? 0) === 0) {
    await supabase.from('stories').update({ status: 'NEEDS_REVIEW' }).eq('id', job.story_id);
  }
}

async function renderStoryPdf(_supabase: SupabaseClient, _job: StoryJob): Promise<void> {
  // Implemented in src/lib/providers/pdf/render.ts and invoked from the
  // download-PDF API route directly (synchronous, since PDF rendering is
  // fast) — this job type is reserved for future async/batch PDF
  // rendering (e.g. bulk ZIP export of a whole class).
  throw new Error('RENDER_PDF job execution is not implemented as an async job yet.');
}
