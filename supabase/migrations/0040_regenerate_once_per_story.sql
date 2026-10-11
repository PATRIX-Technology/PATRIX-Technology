-- ============================================================================
-- 0040_regenerate_once_per_story.sql
-- Tightens manual page regeneration from "3 times per page" (up to 18
-- extra Gemini calls on a 6-page story in the worst case) to "once per
-- story, total, across every page, for every subscription tier" -- a
-- deliberate cost-control decision, not a UX one; see docs/DECISIONS.md
-- "Regeneration limit: once per story, not per page". regenerate_count
-- stays a per-page column (no schema change needed) -- this just changes
-- what the RPC checks: the SUM across every page of the story, not one
-- page's own count.
-- ============================================================================

create or replace function regenerate_story_page(
  target_story_id uuid,
  target_page_id uuid,
  new_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  story stories%rowtype;
  page story_pages%rowtype;
  story_regenerations_used integer;
begin
  select * into story from stories where id = target_story_id;
  if story.id is null then
    raise exception 'Story not found';
  end if;

  if not is_tenant_member(story.tenant_id) then
    raise exception 'Not authorized for this story';
  end if;

  if story.status = 'APPROVED' then
    raise exception 'This story has already been approved and can no longer be regenerated.';
  end if;

  select * into page from story_pages where id = target_page_id and story_id = target_story_id;
  if page.id is null then
    raise exception 'Page not found';
  end if;

  select coalesce(sum(regenerate_count), 0) into story_regenerations_used
  from story_pages where story_id = target_story_id;

  if story_regenerations_used >= 1 then
    raise exception 'This story has already used its one allowed regeneration. Contact support if it still needs fixing.';
  end if;

  update story_pages
  set image_status = 'QUEUED',
      attempts = 0,
      regenerate_count = page.regenerate_count + 1,
      last_error = null,
      text = coalesce(new_text, text)
  where id = target_page_id;

  insert into story_jobs (story_id, page_id, job_type)
  values (target_story_id, target_page_id, 'GENERATE_PAGE_IMAGE');

  update stories set status = 'GENERATING' where id = target_story_id;
end;
$$;
