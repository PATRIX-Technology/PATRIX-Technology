-- ============================================================================
-- Minimal stand-in for the parts of Supabase's built-in `auth` schema that
-- our migrations depend on (auth.users, auth.uid(), auth.role()). Used ONLY
-- by the local integration test harness (tests/integration/db/setup.ts) so
-- tenant isolation / RLS / RPC business rules can be verified against a
-- REAL Postgres instance without requiring the full Supabase Docker stack.
-- Never run this against a real Supabase project.
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Mirrors Supabase's auth.uid(): reads the 'sub' claim that PostgREST sets
-- as a GUC per-request. Our test harness sets this with SET/SET LOCAL to
-- simulate "logged in as this user".
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

-- Roles mirroring Supabase's built-in Postgres roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
