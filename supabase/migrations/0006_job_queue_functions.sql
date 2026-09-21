-- ============================================================================
-- 0006_job_queue_functions.sql
-- Atomic job claiming for the polling worker (src/lib/jobs/worker.ts).
-- Uses FOR UPDATE SKIP LOCKED so multiple worker instances can run
-- concurrently without ever double-claiming the same job.
-- ============================================================================

create or replace function claim_next_story_job()
returns story_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed story_jobs%rowtype;
begin
  select * into claimed
  from story_jobs
  where status = 'QUEUED' and next_retry_at <= now()
  order by created_at
  for update skip locked
  limit 1;

  if claimed.id is null then
    return null;
  end if;

  update story_jobs
  set status = 'RUNNING', claimed_at = now(), updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

-- Only the service role should ever call this (the worker runs with the
-- service-role key) — no grant to `authenticated` or `anon`.
revoke all on function claim_next_story_job() from public, anon, authenticated;
