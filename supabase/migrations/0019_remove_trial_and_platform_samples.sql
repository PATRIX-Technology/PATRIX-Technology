-- ============================================================================
-- 0019_remove_trial_and_platform_samples.sql
-- Two changes requested together by the founder:
--
-- 1. Removes the automatic "1 free story" every new signup got (both
--    create_family_tenant's explicit insert and the quotas table's own
--    column default). This was being exploited: anyone could keep
--    creating new family accounts to farm free real story generations
--    indefinitely, since nothing before this required payment.
--
-- 2. Adds a mechanism for exactly the replacement the founder asked
--    for: a fixed, zero-cost "sample story" (one English, one Arabic)
--    shown on a new family account's dashboard instead of letting them
--    generate their own for free, with the subscription plans shown
--    right below. stories.is_platform_sample marks which existing,
--    already-generated stories serve as those samples -- the founder
--    picks them himself (see the SQL at the bottom of this file's
--    accompanying handoff message), not hardcoded here, since which
--    stories look best is a taste call, not a technical one. Reusing
--    real already-paid-for illustrations costs nothing further; this
--    never triggers a new generation.
-- ============================================================================

alter table quotas alter column stories_included_this_period set default 0;

comment on column quotas.stories_included_this_period is
  'How many stories this tenant can generate in the current billing period. Defaults to 0 -- there is no free trial story; see docs/DECISIONS.md "Removing the free trial story" for why. A real value only ever comes from sync_quota_to_plan (a paid plan) or a redeemed gift code.';

create or replace function create_family_tenant(family_display_name text, owner_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  tenant_slug text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a family account';
  end if;

  insert into profiles (id, full_name)
  values (auth.uid(), owner_full_name)
  on conflict (id) do nothing;

  tenant_slug := 'family-' || replace(auth.uid()::text, '-', '');

  insert into tenants (name, slug, tenant_type)
  values (family_display_name, tenant_slug, 'family')
  returning id into new_tenant_id;

  insert into tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'nursery_owner');

  -- No free trial story -- see docs/DECISIONS.md "Removing the free
  -- trial story". A family sees the fixed platform sample stories
  -- (get_platform_sample_stories below) instead, and must subscribe to
  -- generate their own.
  insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period)
  values (new_tenant_id, 0, 0);

  insert into subscriptions (tenant_id) values (new_tenant_id);

  return new_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform sample stories: a fixed, founder-chosen pair (one 'en', one
-- 'ar') of already-generated, already-approved stories shown to every
-- new family account instead of a free trial. Deliberately NOT scoped
-- by tenant_id in the RLS sense -- every other query in this project is
-- tenant-isolated, but a sample explicitly meant for every viewer to
-- see is the one legitimate exception, so it goes through a narrow
-- security-definer RPC rather than a relaxed RLS policy on `stories`
-- itself (which would risk leaking real tenant data far more broadly).
-- ---------------------------------------------------------------------------
alter table stories add column is_platform_sample boolean not null default false;

comment on column stories.is_platform_sample is
  'Marks this story as one of the (at most one per locale) fixed samples shown on a new family account''s dashboard in place of a free trial. Set manually by the founder via SQL on an already-approved story he chooses -- never set by application code.';

-- At most one sample per locale -- get_platform_sample_stories below
-- assumes this and would otherwise return an arbitrary one of several.
create unique index stories_one_platform_sample_per_locale_idx
  on stories (locale)
  where is_platform_sample;

create type platform_sample_story as (
  story_id uuid,
  theme_key text,
  locale app_locale,
  title text,
  synopsis text,
  first_page_text text,
  first_page_image_asset_path text
);

create or replace function get_platform_sample_stories()
returns setof platform_sample_story
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.theme_key,
    s.locale,
    tpl.title,
    tpl.synopsis,
    p.text,
    p.image_asset_path
  from stories s
  join story_theme_templates tpl on tpl.theme_key = s.theme_key and tpl.locale = s.locale
  left join story_pages p on p.story_id = s.id and p.page_number = 1
  where s.is_platform_sample;
$$;

grant execute on function get_platform_sample_stories() to authenticated;
