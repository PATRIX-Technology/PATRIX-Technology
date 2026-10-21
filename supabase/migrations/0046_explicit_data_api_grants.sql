-- Supabase is removing automatic Data API (PostgREST) grants on new
-- public-schema tables from 30 Oct 2026 onward -- see the Supabase
-- notice "Data API access for new tables" (docs/DECISIONS.md "Explicit
-- Data API grants replace Supabase's automatic default"). Without this
-- migration, every table created by a future migration would need its
-- own explicit grant statement, and -- more urgently -- replaying the
-- full migration history after that date (a new Supabase project, a
-- preview branch, or a local `supabase db reset`) would silently leave
-- every single table in this schema with no Data API access at all,
-- since none of migrations 0001-0045 ever granted anything explicitly.
--
-- This mirrors exactly what Supabase's own automatic default already
-- grants today, so it changes nothing about real access -- RLS (enabled
-- and enforced on all 23 tables) remains the actual security boundary.
-- `alter default privileges` makes this apply to every table any future
-- migration creates too, so no later migration needs its own grant.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;
