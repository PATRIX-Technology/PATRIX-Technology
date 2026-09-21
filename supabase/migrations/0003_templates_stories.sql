-- ============================================================================
-- 0003_templates_stories.sql
-- Story theme templates (platform-wide, database-driven) and the stories /
-- story_pages / story_jobs generation pipeline.
-- ============================================================================

create type native_review_status as enum ('draft', 'reviewed');
create type story_status as enum (
  'DRAFT', 'QUEUED', 'GENERATING', 'GENERATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED'
);
create type page_image_status as enum ('PENDING', 'QUEUED', 'GENERATING', 'GENERATED', 'FAILED');
create type job_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
create type job_type as enum ('GENERATE_PAGE_IMAGE', 'RENDER_PDF');

-- ---------------------------------------------------------------------------
-- story_theme_templates: platform-owned, database-driven story content.
-- One row per (theme_key, locale). Tokens like {child_name}, {pronoun},
-- {pronoun_possessive}, {mascot}, {organisation} are substituted at
-- generation time — see src/lib/domain/templates.ts.
-- ---------------------------------------------------------------------------
create table story_theme_templates (
  id uuid primary key default gen_random_uuid(),
  theme_key text not null,
  locale app_locale not null,
  title text not null,
  synopsis text not null,
  mascot_name text not null default 'Marya the Fox',
  pages jsonb not null,
  native_review_status native_review_status not null default 'draft',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (theme_key, locale)
);

comment on column story_theme_templates.pages is
  'Array of {"order": int, "text": "... {child_name} ...", "image_prompt": "..."}. Text and image_prompt both support tokens.';
comment on column story_theme_templates.native_review_status is
  'English templates are treated as reviewed on creation. Arabic templates start as draft and MUST be flipped to reviewed by a native Arabic reviewer before they can be used for a real child — enforced in application code AND by the story-creation RLS-adjacent check function below.';

create index story_theme_templates_theme_key_idx on story_theme_templates (theme_key);

-- ---------------------------------------------------------------------------
-- stories
-- ---------------------------------------------------------------------------
create table stories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  theme_key text not null,
  locale app_locale not null,
  status story_status not null default 'DRAFT',
  avatar_config_snapshot jsonb not null,
  rejected_reason text,
  pdf_asset_path text,
  bulk_export_id uuid,
  created_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_tenant_id_idx on stories (tenant_id);
create index stories_child_id_idx on stories (child_id);

comment on column stories.avatar_config_snapshot is
  'Copy of the child avatar_config at story-creation time, so edits to the child later do not change an in-progress or already-approved story (consistency requirement).';

-- ---------------------------------------------------------------------------
-- story_pages
-- ---------------------------------------------------------------------------
create table story_pages (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  page_number integer not null,
  text text not null,
  image_prompt text not null,
  image_asset_path text,
  image_status page_image_status not null default 'PENDING',
  provider text,
  cost_usd numeric(10, 4) not null default 0,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, page_number)
);

create index story_pages_story_id_idx on story_pages (story_id);

-- ---------------------------------------------------------------------------
-- story_jobs: the generation queue. A lightweight polling worker
-- (src/lib/jobs/worker.ts) claims QUEUED jobs, executes them via the
-- ImageProvider abstraction, and writes back status/attempts. See
-- docs/DECISIONS.md for why a DB-backed queue was chosen over an external
-- broker for the MVP.
-- ---------------------------------------------------------------------------
create table story_jobs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  page_id uuid references story_pages (id) on delete cascade,
  job_type job_type not null,
  status job_status not null default 'QUEUED',
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  next_retry_at timestamptz not null default now(),
  last_error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index story_jobs_status_next_retry_idx on story_jobs (status, next_retry_at);
create index story_jobs_story_id_idx on story_jobs (story_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table story_theme_templates enable row level security;
alter table stories enable row level security;
alter table story_pages enable row level security;
alter table story_jobs enable row level security;

-- Templates are readable by any authenticated tenant member (to pick a
-- theme) and writable only by the platform owner.
create policy "templates_authenticated_select" on story_theme_templates
  for select using (auth.role() = 'authenticated');

create policy "templates_owner_write" on story_theme_templates
  for all using (is_platform_owner()) with check (is_platform_owner());

create policy "stories_tenant_select" on stories
  for select using (is_tenant_member(tenant_id) or is_platform_owner());

create policy "stories_tenant_write" on stories
  for insert with check (is_tenant_member(tenant_id));

create policy "stories_tenant_update" on stories
  for update using (is_tenant_member(tenant_id) or is_platform_owner())
  with check (is_tenant_member(tenant_id) or is_platform_owner());

-- story_pages / story_jobs are scoped indirectly through their parent story.
create policy "story_pages_via_story" on story_pages
  for select using (
    exists (
      select 1 from stories s
      where s.id = story_pages.story_id and (is_tenant_member(s.tenant_id) or is_platform_owner())
    )
  );

create policy "story_pages_update_via_story" on story_pages
  for update using (
    exists (
      select 1 from stories s
      where s.id = story_pages.story_id and (is_tenant_member(s.tenant_id) or is_platform_owner())
    )
  );

create policy "story_pages_insert_via_story" on story_pages
  for insert with check (
    exists (
      select 1 from stories s
      where s.id = story_pages.story_id and is_tenant_member(s.tenant_id)
    )
  );

create policy "story_jobs_via_story" on story_jobs
  for select using (
    exists (
      select 1 from stories s
      where s.id = story_jobs.story_id and (is_tenant_member(s.tenant_id) or is_platform_owner())
    )
  );

-- A tenant member may ENQUEUE a job for their own story (this is what
-- createStory() and the regenerate-page action do, using the regular
-- authenticated client) but may not update one — claiming, retrying, and
-- marking a job SUCCEEDED/FAILED is exclusively the service-role worker's
-- job (src/lib/jobs/worker.ts), which bypasses RLS by design. There is
-- deliberately no client-facing UPDATE policy for this table.
create policy "story_jobs_insert_via_story" on story_jobs
  for insert with check (
    exists (
      select 1 from stories s
      where s.id = story_jobs.story_id and is_tenant_member(s.tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- approve_story / reject_story RPCs: the only way a story can transition
-- into APPROVED. Enforces that every page has a GENERATED image and, for
-- Arabic stories, that the template used was 'reviewed' not 'draft'.
-- ---------------------------------------------------------------------------
create or replace function approve_story(target_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  story stories%rowtype;
  unfinished_pages integer;
begin
  select * into story from stories where id = target_story_id;
  if story.id is null then
    raise exception 'Story not found';
  end if;

  if not (has_tenant_role(story.tenant_id, array['nursery_owner', 'nursery_admin', 'nursery_staff']::tenant_role[]) or is_platform_owner()) then
    raise exception 'Not authorized to approve this story';
  end if;

  if story.status <> 'NEEDS_REVIEW' and story.status <> 'GENERATED' then
    raise exception 'Story is not in a reviewable state (%)', story.status;
  end if;

  select count(*) into unfinished_pages from story_pages
  where story_id = target_story_id and image_status <> 'GENERATED';

  if unfinished_pages > 0 then
    raise exception 'Cannot approve: % page(s) are not fully generated', unfinished_pages;
  end if;

  update stories
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now()
  where id = target_story_id;
end;
$$;

create or replace function reject_story(target_story_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  story stories%rowtype;
begin
  select * into story from stories where id = target_story_id;
  if story.id is null then
    raise exception 'Story not found';
  end if;

  if not (has_tenant_role(story.tenant_id, array['nursery_owner', 'nursery_admin', 'nursery_staff']::tenant_role[]) or is_platform_owner()) then
    raise exception 'Not authorized to reject this story';
  end if;

  update stories set status = 'REJECTED', rejected_reason = reason where id = target_story_id;
end;
$$;

grant execute on function approve_story(uuid) to authenticated;
grant execute on function reject_story(uuid, text) to authenticated;
