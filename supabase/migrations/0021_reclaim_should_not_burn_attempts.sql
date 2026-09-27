-- ============================================================================
-- 0021_reclaim_should_not_burn_attempts.sql
-- reclaim_stale_story_jobs() (migration 0020) incremented `attempts` every
-- time it requeued a job stuck in RUNNING. In practice, under real load,
-- a job can get claimed right before a batch hits Vercel's 60s limit,
-- get orphaned, get reclaimed, get claimed again right before the *next*
-- batch's limit, and so on -- exhausting its retry budget purely from bad
-- timing, before it ever got a real chance to actually run. Confirmed
-- live: a page's job hit max_attempts and was marked permanently FAILED
-- this way, with no actual generation failure behind it.
--
-- Being orphaned by an infrastructure timeout is not the job's fault, so
-- it should not spend one of its attempts -- only a real failure inside
-- generatePageImage() (handled by handleJobFailure() in
-- src/lib/jobs/worker.ts) should do that. Reclaim now just resets status/
-- claimed_at/next_retry_at and leaves attempts untouched, so a job keeps
-- getting retried until it actually gets to run to completion (success or
-- a real failure), never dying just from unlucky timing.
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
  update story_jobs
  set status = 'QUEUED',
      claimed_at = null,
      next_retry_at = now(),
      last_error = 'Reclaimed after being stuck in RUNNING (worker was likely killed mid-request).',
      updated_at = now()
  where status = 'RUNNING'
    and claimed_at < now() - stale_after;

  get diagnostics reclaimed_count = row_count;
  return coalesce(reclaimed_count, 0);
end;
$$;

revoke all on function reclaim_stale_story_jobs(interval) from public, anon, authenticated;
