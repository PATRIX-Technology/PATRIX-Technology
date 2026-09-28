-- ============================================================================
-- 0026_regenerate_caps.sql
-- Founder feedback: "I don't think regenerate is a good thing right? it's
-- costly" -- each manual "regenerate this page" click is a real, paid
-- Gemini image call, and until now it had no cap other than a rolling
-- 10-per-10-minutes-per-user rate limit (see docs/DECISIONS.md "Rate limit
-- on 'regenerate this page'"), which still lets one page get regenerated
-- indefinitely over a longer session, including after the story has
-- already been approved and finalized.
--
-- `story_pages.attempts` already exists but is NOT reusable for this: the
-- worker increments and resets it for its own automatic retry/backoff
-- logic on real generation failures (see src/lib/jobs/worker.ts), and
-- regeneratePageAction already resets it to 0 on every manual regenerate
-- so the worker's retry budget starts fresh. Overloading it with a
-- separate "how many times has a human clicked regenerate" count would
-- make automatic retries silently count against, or reset, the human's
-- limit. So this adds its own independent, monotonically-increasing
-- counter instead.
-- ============================================================================

alter table story_pages
  add column regenerate_count integer not null default 0;

comment on column story_pages.regenerate_count is
  'How many times a human has manually clicked "regenerate this page". Never reset (unlike attempts, which the worker owns for its own retry/backoff and which regeneratePageAction resets on every manual regenerate). Capped client- and server-side in regeneratePageAction -- see docs/DECISIONS.md "Cap manual page regeneration per page and block it after approval".';
