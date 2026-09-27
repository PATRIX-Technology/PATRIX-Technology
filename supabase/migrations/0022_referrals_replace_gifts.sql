-- ============================================================================
-- 0022_referrals_replace_gifts.sql
-- Founder decision: replace the gift-purchase/redemption feature with a
-- referral program — any existing tenant can invite people to subscribe,
-- and is rewarded with free stories once the invitee's subscription
-- first goes active. Reward size matches the invitee's plan
-- (stories_per_month) and is credited exactly once, on their first
-- successful checkout — never recurring, never on a later upgrade or
-- renewal. See docs/DECISIONS.md "Referral program replaces gifting".
--
-- No real gift has ever been purchased (Stripe has never gone live —
-- see docs/DECISIONS.md "Phase 3 additions"), so removing the gifts
-- table below is a clean drop, not a data migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Every tenant gets a short, shareable referral code, generated once at
-- creation. A trigger (not a change to create_tenant/create_family_tenant's
-- signature) so referral-code generation stays independent of exactly how
-- a tenant gets created — lower risk than threading a new parameter
-- through two existing, already-relied-on functions.
-- ---------------------------------------------------------------------------
alter table tenants add column referral_code text unique;

comment on column tenants.referral_code is
  'Short shareable code for this tenant to invite others — see record_referral/reward_referral below. Generated automatically on insert by tenants_generate_referral_code; never set by application code.';

create or replace function generate_tenant_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;

create trigger tenants_generate_referral_code
  before insert on tenants
  for each row
  execute function generate_tenant_referral_code();

-- Backfill any tenant created before this migration (the trigger above
-- only fires on INSERT).
update tenants set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

-- ---------------------------------------------------------------------------
-- referrals: one row per successful invite. invitee_tenant_id is unique
-- so a tenant can only ever be referred once (the first record_referral
-- call wins; a later one is a silent no-op via ON CONFLICT below).
-- ---------------------------------------------------------------------------
create type referral_status as enum ('pending', 'rewarded');

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_tenant_id uuid not null references tenants (id) on delete cascade,
  invitee_tenant_id uuid not null references tenants (id) on delete cascade unique,
  status referral_status not null default 'pending',
  reward_stories integer,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);

create index referrals_referrer_tenant_id_idx on referrals (referrer_tenant_id);

alter table referrals enable row level security;

-- No client-facing insert/update policy: rows are created/updated only
-- via the SECURITY DEFINER RPCs below, same trust model gifts used.
create policy "referrals_referrer_select" on referrals
  for select using (is_tenant_member(referrer_tenant_id) or is_platform_owner());

-- ---------------------------------------------------------------------------
-- record_referral: called right after a brand-new tenant is created, if
-- the sign-up page carried a ?ref=CODE. Silently a no-op for an unknown
-- code, a self-referral, a tenant that already has a referral row
-- (defensive against being called twice for the same tenant), OR a
-- caller who isn't a member of new_tenant_id -- without that last
-- check, any authenticated user could call this with an arbitrary
-- existing tenant_id as the "invitee", planting a pending referral
-- that later pays the attacker's tenant real free stories off of a
-- stranger's actual subscription payment (via reward_referral, at
-- their next checkout). Same is_tenant_member guard redeem_gift used.
-- ---------------------------------------------------------------------------
create or replace function record_referral(referral_code_used text, new_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_id uuid;
begin
  if referral_code_used is null or btrim(referral_code_used) = '' then
    return;
  end if;

  if not is_tenant_member(new_tenant_id) then
    return;
  end if;

  select id into referrer_id from tenants where referral_code = upper(btrim(referral_code_used));

  if referrer_id is null or referrer_id = new_tenant_id then
    return;
  end if;

  insert into referrals (referrer_tenant_id, invitee_tenant_id)
  values (referrer_id, new_tenant_id)
  on conflict (invitee_tenant_id) do nothing;
end;
$$;

grant execute on function record_referral(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- reward_referral: called from the Stripe webhook when a tenant's
-- subscription checkout completes. The `status = 'pending'` guard makes
-- this one-time by construction — a tenant who checks out again later
-- (upgrade or a fresh renewal checkout) has already flipped to
-- 'rewarded' and this becomes a no-op. service_role only, same as
-- sync_quota_to_plan (0016) which this mirrors.
-- ---------------------------------------------------------------------------
create or replace function reward_referral(target_tenant_id uuid, target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r referrals%rowtype;
  plan_stories integer;
begin
  select * into r from referrals
  where invitee_tenant_id = target_tenant_id and status = 'pending'
  for update;

  if r.id is null then
    return;
  end if;

  select stories_per_month into plan_stories from plans where id = target_plan_id;
  if plan_stories is null then
    return;
  end if;

  update referrals
  set status = 'rewarded', reward_stories = plan_stories, rewarded_at = now()
  where id = r.id;

  insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period)
  values (r.referrer_tenant_id, plan_stories, 0)
  on conflict (tenant_id) do update
  set stories_included_this_period = quotas.stories_included_this_period + plan_stories,
      updated_at = now();
end;
$$;

comment on function reward_referral is
  'Credits the referrer''s quota with free stories matching the invitee''s plan allowance, once, the first time the invitee''s subscription checkout completes. Called only from the Stripe webhook (service_role) -- never exposed to authenticated tenants.';

revoke all on function reward_referral(uuid, uuid) from public, authenticated, anon;
grant execute on function reward_referral(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- get_referral_summary: backs the "Invite & earn free stories" settings
-- card -- the tenant's own code plus how many invites are pending vs.
-- rewarded and how many free stories they've earned in total.
-- ---------------------------------------------------------------------------
create type referral_summary as (
  referral_code text,
  pending_count integer,
  rewarded_count integer,
  total_stories_earned integer
);

create or replace function get_referral_summary(target_tenant_id uuid)
returns referral_summary
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result referral_summary;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select referral_code into result.referral_code from tenants where id = target_tenant_id;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'rewarded'),
    coalesce(sum(reward_stories) filter (where status = 'rewarded'), 0)
  into result.pending_count, result.rewarded_count, result.total_stories_earned
  from referrals
  where referrer_tenant_id = target_tenant_id;

  return result;
end;
$$;

grant execute on function get_referral_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Remove the gift feature entirely -- replaced by the referral program
-- above.
-- ---------------------------------------------------------------------------
drop function if exists redeem_gift(text, uuid);
drop function if exists get_gift_status(text);
drop table if exists gifts;
drop type if exists gift_status_result;
drop type if exists gift_status;
