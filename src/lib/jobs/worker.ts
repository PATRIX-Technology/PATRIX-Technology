import type { SupabaseClient } from '@supabase/supabase-js';
import { createImageProvider } from '@/lib/providers/image/factory';
import { ImageGenerationError, SpendCapExceededError } from '@/lib/providers/image/ImageProvider';
import { errorMessage } from '@/lib/errors';
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

  // Claiming is a single atomic call (FOR UPDATE SKIP LOCKED — see
  // 0006_job_queue_functions.sql), so grab every available job up front,
  // then actually run them concurrently below. A story's pages used to
  // generate one at a time, so a 4-page story's wall-clock time was the
  // SUM of 4 real Gemini calls — easily enough to blow past Vercel's
  // function timeout on a paid image provider. Running them in parallel
  // instead bounds it to roughly the slowest single call.
  const jobs: StoryJob[] = [];
  for (let i = 0; i < maxJobs; i++) {
    const { data: job, error } = await supabase.rpc('claim_next_story_job');
    if (error) throw error;
    if (!job) break;
    jobs.push(job as StoryJob);
  }

  const { firstWave, secondWave } = await splitIntoWaves(supabase, jobs);

  // Two waves, not one flat Promise.all: a story's page 1 has to finish
  // and be marked GENERATED before pages 2+ start, or
  // fetchEarliestGeneratedPageImage() below finds nothing and every page
  // generates its illustration with no reference to keep the character
  // consistent — see docs/DECISIONS.md "Character consistency across a
  // story's pages" and "Two-wave job execution". Everything in a wave
  // still runs fully in parallel (across different stories, and
  // alongside RENDER_PDF jobs), so this only adds one extra Gemini
  // call's worth of latency to multi-page story creation, not a return
  // to the fully-sequential original.
  const record = (outcome: 'succeeded' | 'failed' | 'retried') => {
    result.processed++;
    if (outcome === 'succeeded') result.succeeded++;
    else if (outcome === 'failed') result.failed++;
    else result.retried++;
  };

  (await Promise.all(firstWave.map((job) => processJob(supabase, job)))).forEach(record);
  (await Promise.all(secondWave.map((job) => processJob(supabase, job)))).forEach(record);

  return result;
}

/**
 * Splits claimed jobs into two execution waves: for each story, its
 * lowest-page-number GENERATE_PAGE_IMAGE job goes in the first wave and
 * every other page job for that story goes in the second; RENDER_PDF
 * jobs and any story with only one claimed page job are unaffected and
 * run in the first wave.
 */
async function splitIntoWaves(
  supabase: SupabaseClient,
  jobs: StoryJob[],
): Promise<{ firstWave: StoryJob[]; secondWave: StoryJob[] }> {
  const pageJobs = jobs.filter((job) => job.job_type === 'GENERATE_PAGE_IMAGE' && job.page_id);
  const otherJobs = jobs.filter((job) => !(job.job_type === 'GENERATE_PAGE_IMAGE' && job.page_id));

  if (pageJobs.length === 0) {
    return { firstWave: otherJobs, secondWave: [] };
  }

  const pageIds = pageJobs.map((job) => job.page_id as string);
  const { data: pages, error } = await supabase.from('story_pages').select('id, page_number').in('id', pageIds);
  if (error) throw error;
  const pageNumberById = new Map((pages ?? []).map((p) => [p.id as string, p.page_number as number]));

  const byStory = new Map<string, StoryJob[]>();
  for (const job of pageJobs) {
    const list = byStory.get(job.story_id) ?? [];
    list.push(job);
    byStory.set(job.story_id, list);
  }

  const firstWave: StoryJob[] = [...otherJobs];
  const secondWave: StoryJob[] = [];
  for (const storyJobs of byStory.values()) {
    const sorted = [...storyJobs].sort(
      (a, b) => (pageNumberById.get(a.page_id as string) ?? 0) - (pageNumberById.get(b.page_id as string) ?? 0),
    );
    firstWave.push(sorted[0]!);
    secondWave.push(...sorted.slice(1));
  }

  return { firstWave, secondWave };
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
  const message = errorMessage(error);
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
    .select('*, stories!inner(tenant_id, status, child_id, avatar_config_snapshot, pronoun_snapshot, locale)')
    .eq('id', job.page_id)
    .single();
  if (pageError) throw pageError;

  await supabase
    .from('story_pages')
    .update({ image_status: 'GENERATING' })
    .eq('id', job.page_id);

  const [referencePhoto, referenceImage] = await Promise.all([
    fetchChildReferencePhoto(supabase, page.stories.child_id),
    fetchEarliestGeneratedPageImage(supabase, job.story_id),
  ]);

  const provider = createImageProvider(supabase);
  const result = await provider.generate({
    tenantId: page.stories.tenant_id,
    storyId: job.story_id,
    pageId: job.page_id,
    prompt: page.image_prompt,
    avatarConfig: page.stories.avatar_config_snapshot ?? {},
    pronoun: page.stories.pronoun_snapshot ?? 'they',
    captionText: page.text,
    locale: page.stories.locale,
    ...(referencePhoto
      ? { referencePhotoBytes: referencePhoto.bytes, referencePhotoContentType: referencePhoto.contentType }
      : {}),
    ...(referenceImage
      ? { referenceImageBytes: referenceImage.bytes, referenceImageContentType: referenceImage.contentType }
      : {}),
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

interface ReferenceAsset {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * The child's uploaded photo, if photo personalisation was allowed and a
 * photo was uploaded — gated entirely at upload time (see
 * src/lib/actions/children.ts uploadChildPhotoAction), not re-checked
 * here: a populated photo_asset_path already means every condition in
 * isPhotoPersonalizationAllowed() was satisfied when it was written.
 */
async function fetchChildReferencePhoto(
  supabase: SupabaseClient,
  childId: string,
): Promise<ReferenceAsset | null> {
  const { data: child } = await supabase
    .from('children')
    .select('photo_asset_path')
    .eq('id', childId)
    .maybeSingle();
  if (!child?.photo_asset_path) return null;

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(child.photo_asset_path);
  if (error || !data) return null;

  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'image/jpeg' };
}

/** The earliest already-generated page in this story, used as a visual
 * reference so later pages keep the same illustrated character. */
async function fetchEarliestGeneratedPageImage(
  supabase: SupabaseClient,
  storyId: string,
): Promise<ReferenceAsset | null> {
  const { data: earliestPage } = await supabase
    .from('story_pages')
    .select('image_asset_path')
    .eq('story_id', storyId)
    .eq('image_status', 'GENERATED')
    .not('image_asset_path', 'is', null)
    .order('page_number', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!earliestPage?.image_asset_path) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(earliestPage.image_asset_path);
  if (error || !data) return null;

  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'image/png' };
}

async function renderStoryPdf(_supabase: SupabaseClient, _job: StoryJob): Promise<void> {
  // Implemented in src/lib/providers/pdf/render.ts and invoked from the
  // download-PDF API route directly (synchronous, since PDF rendering is
  // fast) — this job type is reserved for future async/batch PDF
  // rendering (e.g. bulk ZIP export of a whole class).
  throw new Error('RENDER_PDF job execution is not implemented as an async job yet.');
}
