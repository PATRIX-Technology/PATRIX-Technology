-- ============================================================================
-- 0009_family_and_gifts.sql
-- Phase 4 scaffolding: individual family accounts and gifting, built on
-- top of the existing tenant/RLS model rather than a parallel system —
-- see docs/DECISIONS.md "Phase 4: families are tenants".
-- ============================================================================

create type tenant_type as enum ('nursery', 'family');

alter table tenants add column tenant_type tenant_type not null default 'nursery';

comment on column tenants.tenant_type is
  'A "family" tenant is an individual parent/guardian account, reusing the same tenant/tenant_members/RLS machinery as a nursery. The sole member holds the existing "nursery_owner" role — the name is a historical artifact of Phase 2, not a claim about what kind of tenant it is (see docs/DECISIONS.md).';

-- ---------------------------------------------------------------------------
-- create_family_tenant: mirrors create_tenant() from 0001, but for an
-- individual family account rather than an organisation.
-- ---------------------------------------------------------------------------
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

  -- Every family gets one free trial story, same as a nursery — see
  -- subscriptions.trial_story_used and the quotas default.
  insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period)
  values (new_tenant_id, 1, 0);

  return new_tenant_id;
end;
$$;

grant execute on function create_family_tenant(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-consent for family-created children: a family tenant's owner IS the
-- child's parent/guardian, so the multi-party "ask a parent, wait for
-- them to click a link" workflow that nursery staff go through does not
-- apply — the act of adding the child under their own family account IS
-- the guardian's consent. Nursery-tenant children are completely
-- unaffected (this trigger is a no-op for tenant_type = 'nursery').
-- ---------------------------------------------------------------------------
create or replace function auto_grant_family_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_type tenant_type;
begin
  select tenant_type into t_type from tenants where id = new.tenant_id;
  if t_type = 'family' then
    new.consent_status := 'granted';
  end if;
  return new;
end;
$$;

create trigger children_auto_grant_family_consent
  before insert on children
  for each row
  execute function auto_grant_family_consent();

-- ---------------------------------------------------------------------------
-- gifts: a purchased pack of story credits, redeemable by anyone holding
-- the code (deliberately low-friction, like a physical gift card — the
-- recipient does not need to be invited or pre-registered anywhere).
-- ---------------------------------------------------------------------------
create type gift_status as enum ('pending_payment', 'paid', 'redeemed', 'expired', 'canceled');

create table gifts (
  id uuid primary key default gen_random_uuid(),
  purchaser_email text not null,
  story_credits integer not null check (story_credits > 0),
  amount_usd numeric(10, 2) not null,
  currency text not null default 'AED',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  code_hash text unique,
  status gift_status not null default 'pending_payment',
  redeemed_by_tenant_id uuid references tenants (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days')
);

comment on column gifts.code_hash is
  'sha256 of the redemption code, same trust model as consent_requests.token_hash — the raw code is generated once at purchase time, embedded in the Stripe success_url, and never stored in plaintext.';

create index gifts_stripe_checkout_session_id_idx on gifts (stripe_checkout_session_id);

alter table gifts enable row level security;

-- No client-facing select/insert/update policy: gift rows are created by
-- the gift-checkout route (service role, before redirecting to Stripe),
-- confirmed by the webhook (service role), and looked up / redeemed only
-- through the SECURITY DEFINER RPCs below, which check the raw code
-- rather than relying on a row-level policy (the same reasoning as
-- respond_to_consent in 0002 — the code itself is the authorization).
-- The platform owner can still see everything for support purposes.
create policy "gifts_owner_select" on gifts
  for select using (is_platform_owner());

-- ---------------------------------------------------------------------------
-- get_gift_status: lets the public success/redeem pages check a gift's
-- status by its code without exposing the row to a general SELECT policy.
-- ---------------------------------------------------------------------------
create type gift_status_result as (
  found boolean,
  status gift_status,
  story_credits integer
);

create or replace function get_gift_status(raw_code text)
returns gift_status_result
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g gifts%rowtype;
  result gift_status_result;
begin
  select * into g from gifts where code_hash = encode(digest(raw_code, 'sha256'), 'hex');
  if g.id is null then
    result.found := false;
    return result;
  end if;
  result.found := true;
  result.status := g.status;
  result.story_credits := g.story_credits;
  return result;
end;
$$;

grant execute on function get_gift_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- redeem_gift: credits the calling tenant's quota and marks the gift
-- redeemed, atomically. A gift can only ever be redeemed once (status
-- transition paid -> redeemed is guarded by the WHERE clause below, so a
-- double-submit race still only credits the quota one time).
-- ---------------------------------------------------------------------------
create or replace function redeem_gift(raw_code text, target_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  g gifts%rowtype;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into g from gifts
  where code_hash = encode(digest(raw_code, 'sha256'), 'hex')
  for update;

  if g.id is null then
    raise exception 'Gift code not found';
  end if;
  if g.status = 'redeemed' then
    raise exception 'This gift code has already been redeemed';
  end if;
  if g.status <> 'paid' then
    raise exception 'This gift code is not ready to redeem yet';
  end if;
  if g.expires_at < now() then
    raise exception 'This gift code has expired';
  end if;

  update gifts
  set status = 'redeemed', redeemed_by_tenant_id = target_tenant_id, redeemed_at = now()
  where id = g.id;

  insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period)
  values (target_tenant_id, g.story_credits, 0)
  on conflict (tenant_id) do update
  set stories_included_this_period = quotas.stories_included_this_period + g.story_credits,
      updated_at = now();

  return g.story_credits;
end;
$$;

grant execute on function redeem_gift(text, uuid) to authenticated;
