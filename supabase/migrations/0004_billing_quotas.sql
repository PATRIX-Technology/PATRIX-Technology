-- ============================================================================
-- 0004_billing_quotas.sql
-- Plans, subscriptions (Stripe test-mode architecture), coupons and
-- per-tenant story quotas.
-- ============================================================================

create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete'
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  price_monthly_cents integer not null,
  price_annual_cents integer not null,
  currency text not null default 'AED',
  vat_inclusive boolean not null default true,
  stories_per_month integer not null,
  seats_included integer not null default 5,
  stripe_price_id_monthly text,
  stripe_price_id_annual text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column plans.vat_inclusive is
  'Whether price_*_cents already includes UAE VAT. Always show this to the buyer at checkout — see docs/DECISIONS.md.';

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  stripe_coupon_id text,
  percent_off integer,
  amount_off_cents integer,
  max_redemptions integer,
  times_redeemed integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade unique,
  plan_id uuid references plans (id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status subscription_status not null default 'trialing',
  trial_story_used boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quotas (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  stories_included_this_period integer not null default 1,
  stories_used_this_period integer not null default 0,
  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '30 days'),
  hard_cap boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table quotas is
  'Denormalized usage counters checked before every story generation. hard_cap=true physically blocks generation once stories_used_this_period >= stories_included_this_period (see consume_story_quota below) — quota enforcement never relies on a client-side check alone.';

-- ---------------------------------------------------------------------------
-- Idempotency ledger for Stripe webhooks: every processed Stripe event id is
-- recorded so a retried webhook delivery is a safe no-op.
-- ---------------------------------------------------------------------------
create table stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table plans enable row level security;
alter table coupons enable row level security;
alter table subscriptions enable row level security;
alter table quotas enable row level security;
alter table stripe_webhook_events enable row level security;

create policy "plans_public_select" on plans for select using (is_active or is_platform_owner());
create policy "plans_owner_write" on plans for all using (is_platform_owner()) with check (is_platform_owner());

create policy "coupons_owner_all" on coupons for all using (is_platform_owner()) with check (is_platform_owner());

create policy "subscriptions_tenant_select" on subscriptions
  for select using (is_tenant_member(tenant_id) or is_platform_owner());
create policy "subscriptions_owner_write" on subscriptions
  for all using (is_platform_owner()) with check (is_platform_owner());

create policy "quotas_tenant_select" on quotas
  for select using (is_tenant_member(tenant_id) or is_platform_owner());
create policy "quotas_owner_write" on quotas
  for all using (is_platform_owner()) with check (is_platform_owner());

-- Webhook events are written only by the service role (webhook handler);
-- no client-facing policy is defined, so RLS denies all client access.
alter table stripe_webhook_events force row level security;

-- ---------------------------------------------------------------------------
-- consume_story_quota: atomically checks and increments quota usage.
-- Returns false (without incrementing) if the hard cap has been reached —
-- callers MUST refuse to create/queue a story when this returns false.
-- SECURITY DEFINER + row lock avoids a race between two concurrent staff
-- members generating stories at the same time.
-- ---------------------------------------------------------------------------
create or replace function consume_story_quota(target_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q quotas%rowtype;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into q from quotas where tenant_id = target_tenant_id for update;

  if q.tenant_id is null then
    insert into quotas (tenant_id) values (target_tenant_id) returning * into q;
  end if;

  if now() > q.period_end then
    update quotas
    set stories_used_this_period = 0,
        period_start = now(),
        period_end = now() + interval '30 days'
    where tenant_id = target_tenant_id
    returning * into q;
  end if;

  if q.hard_cap and q.stories_used_this_period >= q.stories_included_this_period then
    return false;
  end if;

  update quotas
  set stories_used_this_period = stories_used_this_period + 1, updated_at = now()
  where tenant_id = target_tenant_id;

  return true;
end;
$$;

grant execute on function consume_story_quota(uuid) to authenticated;
