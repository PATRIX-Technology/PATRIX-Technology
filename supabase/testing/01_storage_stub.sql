-- ============================================================================
-- Minimal stand-in for the parts of Supabase's built-in `storage` schema
-- that supabase/migrations/0007_storage.sql depends on (storage.buckets,
-- storage.objects, storage.foldername()). Test-harness only — see
-- 00_auth_stub.sql for the same disclaimer.
-- ============================================================================

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

-- Mirrors Supabase's storage.foldername(): splits an object path on '/'
-- and returns every segment except the last (the file name itself).
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
