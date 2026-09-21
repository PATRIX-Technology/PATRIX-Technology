-- ============================================================================
-- 0005_spend_caps_audit.sql
-- Hard AI spending caps (tenant + global) and privacy-safe audit logging.
-- ============================================================================

create table tenant_spend_caps (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  monthly_cap_usd numeric(10, 2) not null default 0,
  current_period_spend_usd numeric(10, 2) not null default 0,
  period_start timestamptz not null default now(),
  kill_switch boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on column tenant_spend_caps.kill_switch is
  'When true, ALL real (paid) image generation for this tenant is blocked regardless of remaining budget. Set automatically when current_period_spend_usd would exceed monthly_cap_usd, and can also be set manually by the platform owner.';

-- Singleton table: exactly one row, id fixed to a well-known UUID.
create table global_spend_cap (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  monthly_cap_usd numeric(10, 2) not null default 0,
  current_period_spend_usd numeric(10, 2) not null default 0,
  period_start timestamptz not null default now(),
  kill_switch boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint global_spend_cap_singleton check (id = '00000000-0000-0000-0000-000000000001')
);

insert into global_spend_cap (id, kill_switch) values ('00000000-0000-0000-0000-000000000001', true);

comment on table global_spend_cap is
  'Platform-wide real-image-generation spend cap. kill_switch defaults to true (OFF) — the platform owner must explicitly disable it after configuring monthly_cap_usd, per docs/DECISIONS.md.';

create table ai_spend_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  story_id uuid references stories (id) on delete set null,
  page_id uuid references story_pages (id) on delete set null,
  provider text not null,
  amount_usd numeric(10, 4) not null,
  created_at timestamptz not null default now()
);

create index ai_spend_ledger_tenant_id_idx on ai_spend_ledger (tenant_id);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only, service-role-write-only. metadata is jsonb but
-- MUST NOT contain child personal data — enforced by convention + tests in
-- tests/unit/audit-log-no-pii.test.ts, since Postgres cannot statically
-- verify "no PII" for us.
-- ---------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_id_idx on audit_logs (tenant_id);
create index audit_logs_action_idx on audit_logs (action);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table tenant_spend_caps enable row level security;
alter table global_spend_cap enable row level security;
alter table ai_spend_ledger enable row level security;
alter table audit_logs enable row level security;

create policy "tenant_spend_caps_select" on tenant_spend_caps
  for select using (is_tenant_member(tenant_id) or is_platform_owner());
create policy "tenant_spend_caps_owner_write" on tenant_spend_caps
  for all using (is_platform_owner()) with check (is_platform_owner());

create policy "global_spend_cap_owner_only" on global_spend_cap
  for all using (is_platform_owner()) with check (is_platform_owner());

create policy "ai_spend_ledger_tenant_select" on ai_spend_ledger
  for select using (is_tenant_member(tenant_id) or is_platform_owner());

create policy "audit_logs_tenant_select" on audit_logs
  for select using (
    (tenant_id is not null and has_tenant_role(tenant_id, array['nursery_owner']::tenant_role[]))
    or is_platform_owner()
  );

-- No insert/update/delete policies are defined for ai_spend_ledger or
-- audit_logs: both are written exclusively by service-role server code,
-- which bypasses RLS. This guarantees clients can never forge audit
-- history or spend records.

-- ---------------------------------------------------------------------------
-- record_ai_spend: the ONLY way spend is recorded. Atomically increments
-- both the tenant and global running totals and flips the relevant
-- kill_switch(es) the instant a cap would be exceeded, in the same
-- transaction as the ledger insert — there is no window where spend can
-- continue after a cap is hit. Intended to be called with the service role
-- key only.
-- ---------------------------------------------------------------------------
create or replace function record_ai_spend(
  target_tenant_id uuid,
  target_story_id uuid,
  target_page_id uuid,
  provider_name text,
  amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ai_spend_ledger (tenant_id, story_id, page_id, provider, amount_usd)
  values (target_tenant_id, target_story_id, target_page_id, provider_name, amount);

  insert into tenant_spend_caps (tenant_id, current_period_spend_usd)
  values (target_tenant_id, amount)
  on conflict (tenant_id) do update
  set current_period_spend_usd = tenant_spend_caps.current_period_spend_usd + amount,
      updated_at = now();

  update tenant_spend_caps
  set kill_switch = true
  where tenant_id = target_tenant_id and current_period_spend_usd >= monthly_cap_usd;

  update global_spend_cap
  set current_period_spend_usd = current_period_spend_usd + amount, updated_at = now();

  update global_spend_cap
  set kill_switch = true
  where current_period_spend_usd >= monthly_cap_usd;
end;
$$;

-- ---------------------------------------------------------------------------
-- can_spend: the pre-flight check the RealImageProvider MUST call (and
-- honour) before making any paid API call. Returns false if either the
-- tenant or global kill switch is engaged.
-- ---------------------------------------------------------------------------
create or replace function can_spend(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not coalesce((select kill_switch from global_spend_cap limit 1), true)
    and not coalesce((select kill_switch from tenant_spend_caps where tenant_id = target_tenant_id), false);
$$;
