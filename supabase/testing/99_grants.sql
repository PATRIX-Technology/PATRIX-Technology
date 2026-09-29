-- Run BEFORE any supabase/migrations/*.sql — see db/setup.ts. Mirrors
-- Supabase's real project bootstrap: `anon`/`authenticated` get a
-- broad default privilege on the public schema from the moment the
-- project is created, chronologically before any of our own
-- migrations ever create a table. Using ALTER DEFAULT PRIVILEGES
-- (rather than GRANT ... ON ALL TABLES) makes that grant apply
-- automatically to every table our migrations create afterward, same
-- as it does in a real project — which matters because it lets a
-- LATER migration correctly narrow a column/table grant on a
-- specific table (e.g. migration 0029 on `profiles`) without this
-- fixture silently re-widening it again on every replay. Getting this
-- ordering wrong previously masked exactly that kind of fix in local
-- tests — see docs/DECISIONS.md "Two critical privilege-escalation
-- holes (security audit)".
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon;
grant service_role to postgres;
