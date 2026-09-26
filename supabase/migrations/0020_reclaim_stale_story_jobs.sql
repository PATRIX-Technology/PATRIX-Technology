-- ============================================================================
-- 0020_reclaim_stale_story_jobs.sql
-- Fixes stories that end up stuck showing only 2-3 pages generated
-- forever. Root cause: a job claimed by claim_next_story_job() moves to
-- RUNNING, but if the worker process is killed mid-request (e.g. a
-- Vercel function timeout during real Gemini generation — see
-- docs/DECISIONS.md "Defending against a mid-generation function
-- timeout"), nothing ever moves that row out of RUNNING. Confirmed live
-- in production: several story_jobs rows sat at RUNNING for hours.
-- claim_next_story_job() only ever looks at QUEUED rows, so a job stuck
-- at RUNNING is invisible to it forever.
-- ============================================================================

create or replace function reclaim_stale_story_jobs(stale_after interval default interval '5 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reclaimed_count integer;
begin
  -- Jobs with attempts left: put back in the queue for an immediate retry.
  with stale as (
    select id from story_jobs
    where status = 'RUNNING'
      and claimed_at < now() - stale_after
      and attempts < max_attempts
    for update skip locked
  )
  update story_jobs
  set status = 'QUEUED',
      claimed_at = null,
      attempts = story_jobs.attempts + 1,
      next_retry_at = now(),
      last_error = 'Reclaimed after being stuck in RUNNING (worker was likely killed mid-request).',
      updated_at = now()
  from stale
  where story_jobs.id = stale.id;

  get diagnostics reclaimed_count = row_count;

  -- Jobs that have exhausted their attempts: give up on them for real,
  -- and cascade the failure to the page/story the same way
  -- handleJobFailure() does in src/lib/jobs/worker.ts. Captured into a
  -- temp table (not just a CTE) so the page_id/story_id lists survive
  -- past the first UPDATE for the two cascade UPDATEs below.
  create temporary table _exhausted_jobs on commit drop as
  select id, page_id, story_id from story_jobs
  where status = 'RUNNING'
    and claimed_at < now() - stale_after
    and attempts >= max_attempts;

  update story_jobs
  set status = 'FAILED',
      claimed_at = null,
      last_error = 'Reclaimed after being stuck in RUNNING (worker was likely killed mid-request); no attempts left.',
      updated_at = now()
  where id in (select id from _exhausted_jobs);

  update story_pages
  set image_status = 'FAILED',
      last_error = 'Reclaimed after being stuck in RUNNING (worker was likely killed mid-request); no attempts left.'
  where id in (select page_id from _exhausted_jobs where page_id is not null);

  update stories
  set status = 'FAILED'
  where id in (select story_id from _exhausted_jobs);

  drop table _exhausted_jobs;

  return coalesce(reclaimed_count, 0);
end;
$$;

revoke all on function reclaim_stale_story_jobs(interval) from public, anon, authenticated;
