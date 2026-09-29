-- ============================================================================
-- 0030_secure_story_creation_and_consent.sql
-- Security audit finding: several business rules that matter most in this
-- app -- parental consent, story quota, cross-tenant isolation on
-- children -- were enforced only by the application's own code, never by
-- the database. A tenant member who called Supabase directly (not through
-- this app's UI) could:
--   * insert a `stories`/`story_pages` row with status/image_status
--     already 'APPROVED'/'GENERATED', skipping consent, quota, and the
--     approve_story() RPC entirely;
--   * insert a `story_jobs` row with an arbitrary image_prompt, which the
--     worker sends straight to Gemini -- a live cost/abuse vector, not a
--     theoretical one;
--   * insert a `consent_requests` row targeting a CHILD FROM ANOTHER
--     TENANT (nothing checked child_id/tenant_id belonged together), then
--     have a parent's token response flip that other tenant's child's
--     consent_status;
--   * update `children.consent_status` directly to 'granted', with no
--     parent ever involved.
--
-- Fixed by moving every one of these into the same SECURITY DEFINER RPC
-- pattern already used by approve_story/reject_story/respond_to_consent
-- elsewhere in this schema, closing the direct-write paths that bypassed
-- them, and adding composite foreign keys so a child_id/tenant_id pair
-- that doesn't actually belong together can never be inserted at all,
-- regardless of any RLS policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Composite FKs: a child_id must belong to the SAME tenant_id on any row
-- that carries both. children.id is already globally unique (it's the
-- PK), so (id, tenant_id) is trivially unique too -- this just gives
-- Postgres a target for the composite FK below.
-- ---------------------------------------------------------------------------
alter table children add constraint children_id_tenant_id_key unique (id, tenant_id);

alter table consent_requests
  add constraint consent_requests_child_tenant_fkey
  foreign key (child_id, tenant_id) references children (id, tenant_id);

alter table stories
  add constraint stories_child_tenant_fkey
  foreign key (child_id, tenant_id) references children (id, tenant_id);

-- ---------------------------------------------------------------------------
-- A tenant member may still create a consent_requests row (requesting
-- consent), but never one that starts anywhere other than 'pending' --
-- only respond_to_consent/withdraw_consent may set 'granted'/'declined'/
-- 'withdrawn' for a NURSERY tenant, where the inserting staff member is
-- never the same person as the child's parent.
--
-- A FAMILY tenant is the one deliberate exception: the member inserting
-- the row IS the child's parent/guardian, so uploadChildPhotoAction
-- legitimately inserts an already-'granted' row in one step (see
-- docs/DECISIONS.md "Family photo consent: a single checkbox at upload
-- time") -- there is no third party to send a token link to. Restricting
-- that case to tenant_type = 'family' keeps the nursery bypass this
-- migration closes shut, while not breaking the family self-consent
-- feature that already shipped.
-- ---------------------------------------------------------------------------
drop policy if exists "consent_requests_tenant_insert" on consent_requests;
create policy "consent_requests_tenant_insert" on consent_requests
  for insert with check (
    is_tenant_member(tenant_id)
    and (
      status = 'pending'
      or (
        status = 'granted'
        and exists (
          select 1 from tenants t where t.id = tenant_id and t.tenant_type = 'family'
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- children.consent_status: staff still need to set this directly for
-- 'pending' (requestConsentAction) and other non-decision transitions --
-- only 'granted'/'declined' must be unreachable except from inside
-- respond_to_consent's own transaction. A column-level grant can't
-- express "this value is fine, that one isn't", so this is a trigger,
-- gated by a transaction-local flag only respond_to_consent sets.
-- ---------------------------------------------------------------------------
create or replace function guard_consent_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.consent_status is distinct from old.consent_status
     and new.consent_status in ('granted', 'declined')
     and coalesce(current_setting('app.allow_consent_decision', true), '') <> 'true' then
    raise exception 'consent_status can only be set to granted/declined via respond_to_consent';
  end if;
  return new;
end;
$$;

drop trigger if exists children_consent_status_guard on children;
create trigger children_consent_status_guard
  before update on children
  for each row execute function guard_consent_status_transition();

create or replace function respond_to_consent(raw_token text, decision consent_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req consent_requests%rowtype;
begin
  if decision not in ('granted', 'declined') then
    raise exception 'Invalid decision';
  end if;

  select * into req from consent_requests
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  for update;

  if req.id is null then
    raise exception 'Consent request not found';
  end if;

  if req.expires_at < now() then
    raise exception 'Consent link has expired';
  end if;

  if req.status not in ('pending') then
    raise exception 'This consent request has already been answered';
  end if;

  update consent_requests
  set status = decision, responded_at = now()
  where id = req.id;

  -- Local to this transaction only (the `true` third argument) -- never
  -- leaks into any other session or a later statement on this same
  -- connection, so it can't be used to prop the door open for a
  -- follow-up direct write.
  perform set_config('app.allow_consent_decision', 'true', true);
  update children
  set consent_status = decision
  where id = req.child_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_story: the ONLY way a story/story_pages/story_jobs row may now be
-- created by a tenant member. Enforces consent, quota, and tenant/child
-- ownership atomically, server-side, un-bypassable by a direct insert.
-- Template rendering itself (pure text substitution, no security
-- implications) stays in the app layer -- see createStoryForTenant in
-- src/lib/domain/stories.ts -- this RPC's job is only the guarded writes.
-- `pages` is a jsonb array of {"page_number": int, "text": string,
-- "image_prompt": string}, already rendered by the caller.
-- ---------------------------------------------------------------------------
create or replace function create_story(
  target_tenant_id uuid,
  target_child_id uuid,
  target_theme_key text,
  target_locale app_locale,
  target_avatar_config jsonb,
  target_pronoun pronoun_type,
  pages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  child_row children%rowtype;
  new_story_id uuid;
  quota_ok boolean;
  page_rec jsonb;
  new_page_id uuid;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into child_row from children
  where id = target_child_id and tenant_id = target_tenant_id;
  if child_row.id is null then
    raise exception 'Child not found for this tenant';
  end if;

  if child_row.consent_status <> 'granted' then
    raise exception 'A story cannot be created until this child''s parent has granted consent.';
  end if;

  select consume_story_quota(target_tenant_id) into quota_ok;
  if not quota_ok then
    raise exception 'This organisation has used all the stories included in its current plan period.';
  end if;

  insert into stories (
    tenant_id, child_id, theme_key, locale, status,
    avatar_config_snapshot, pronoun_snapshot, created_by
  )
  values (
    target_tenant_id, target_child_id, target_theme_key, target_locale, 'QUEUED',
    target_avatar_config, target_pronoun, auth.uid()
  )
  returning id into new_story_id;

  for page_rec in select * from jsonb_array_elements(pages)
  loop
    insert into story_pages (story_id, page_number, text, image_prompt)
    values (
      new_story_id,
      (page_rec ->> 'page_number')::int,
      page_rec ->> 'text',
      page_rec ->> 'image_prompt'
    )
    returning id into new_page_id;

    insert into story_jobs (story_id, page_id, job_type)
    values (new_story_id, new_page_id, 'GENERATE_PAGE_IMAGE');
  end loop;

  update stories set status = 'GENERATING' where id = new_story_id;

  return new_story_id;
end;
$$;

grant execute on function create_story(uuid, uuid, text, app_locale, jsonb, pronoun_type, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- regenerate_story_page: the ONLY way a manual "regenerate this page"
-- click may queue a real (paid) regeneration. Enforces tenant ownership,
-- the already-approved block, and the per-page regeneration cap
-- server-side -- the caller only supplies the freshly re-rendered text
-- (pure, non-security-relevant template substitution stays in the app
-- layer, same split as create_story above).
-- ---------------------------------------------------------------------------
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

  if page.regenerate_count >= 3 then
    raise exception 'This page has already been regenerated 3 times, the limit per page. Contact support if it still needs fixing.';
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

grant execute on function regenerate_story_page(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Close the direct-write paths these RPCs replace. Nothing in the app
-- ever needs them any more: every legitimate insert/update they used to
-- allow is now inside create_story / regenerate_story_page / approve_story
-- / reject_story, all SECURITY DEFINER. The worker (story_jobs/story_pages/
-- stories writes during generation) and the service-role sample-story
-- script use the service role, which bypasses RLS entirely and is
-- unaffected by dropping these client-facing policies.
-- ---------------------------------------------------------------------------
drop policy if exists "stories_tenant_write" on stories;
drop policy if exists "stories_tenant_update" on stories;
drop policy if exists "story_pages_insert_via_story" on story_pages;
drop policy if exists "story_pages_update_via_story" on story_pages;
drop policy if exists "story_jobs_insert_via_story" on story_jobs;
