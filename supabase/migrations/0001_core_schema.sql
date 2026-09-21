-- ============================================================================
-- 0001_core_schema.sql
-- Extensions, profiles, tenants, tenant membership, and the helper functions
-- every later RLS policy relies on for tenant isolation.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type tenant_role as enum ('nursery_owner', 'nursery_admin', 'nursery_staff');
create type tenant_status as enum ('active', 'suspended', 'closed');
create type pronoun_type as enum ('she', 'he', 'they');
create type app_locale as enum ('en', 'ar');

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase auth user, holding non-tenant-scoped data.
-- Platform owner status lives here and is the ONLY way to bypass tenant
-- scoping (and only for explicitly allowed platform-owner operations).
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  is_platform_owner boolean not null default false,
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Non-tenant-scoped user profile data. Contains no child personal data.';
comment on column profiles.is_platform_owner is
  'True only for PATRIX platform staff. Grants access to the owner dashboard, never to child PII beyond what a normal support flow requires, and every such access must be audit logged.';

-- ---------------------------------------------------------------------------
-- tenants: one row per nursery / school / clinic / brand customer.
-- ---------------------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status tenant_status not null default 'active',
  logo_asset_path text,
  brand_primary_color text,
  default_locale app_locale not null default 'en',
  data_retention_days integer not null default 730,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column tenants.data_retention_days is
  'Configurable retention window (PDPL-oriented default of 24 months). Enforced by a scheduled job, see docs/DECISIONS.md.';

-- ---------------------------------------------------------------------------
-- tenant_members: join table granting a user a role within a tenant.
-- ---------------------------------------------------------------------------
create table tenant_members (
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role tenant_role not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_members_user_id_idx on tenant_members (user_id);

-- ---------------------------------------------------------------------------
-- Helper functions used throughout RLS policies. SECURITY DEFINER + a fixed
-- search_path keeps them safe to call from policy expressions without
-- re-triggering RLS recursively.
-- ---------------------------------------------------------------------------
create or replace function is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_owner from profiles where id = auth.uid()),
    false
  );
$$;

create or replace function is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = target_tenant_id and user_id = auth.uid()
  );
$$;

create or replace function has_tenant_role(target_tenant_id uuid, allowed_roles tenant_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create or replace function current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from tenant_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table tenants enable row level security;
alter table tenant_members enable row level security;

create policy "profiles_self_select" on profiles
  for select using (id = auth.uid() or is_platform_owner());

create policy "profiles_self_update" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_self_insert" on profiles
  for insert with check (id = auth.uid());

create policy "tenants_member_select" on tenants
  for select using (is_tenant_member(id) or is_platform_owner());

create policy "tenants_owner_update" on tenants
  for update using (has_tenant_role(id, array['nursery_owner']::tenant_role[]) or is_platform_owner())
  with check (has_tenant_role(id, array['nursery_owner']::tenant_role[]) or is_platform_owner());

-- Tenant creation happens via a SECURITY DEFINER RPC (create_tenant, see
-- 0002) rather than a direct insert policy, so the creating user is
-- atomically added as nursery_owner in the same transaction.

create policy "tenant_members_select" on tenant_members
  for select using (is_tenant_member(tenant_id) or is_platform_owner());

create policy "tenant_members_owner_write" on tenant_members
  for all using (has_tenant_role(tenant_id, array['nursery_owner']::tenant_role[]) or is_platform_owner())
  with check (has_tenant_role(tenant_id, array['nursery_owner']::tenant_role[]) or is_platform_owner());

-- ---------------------------------------------------------------------------
-- create_tenant RPC: creates a tenant and makes the calling user its owner
-- in one atomic, security-definer transaction (bypassing the chicken/egg
-- problem of needing to already be a member to insert a member row).
-- ---------------------------------------------------------------------------
create or replace function create_tenant(tenant_name text, tenant_slug text, owner_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a tenant';
  end if;

  insert into profiles (id, full_name)
  values (auth.uid(), owner_full_name)
  on conflict (id) do nothing;

  insert into tenants (name, slug)
  values (tenant_name, tenant_slug)
  returning id into new_tenant_id;

  insert into tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'nursery_owner');

  return new_tenant_id;
end;
$$;
