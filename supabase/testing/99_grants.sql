-- Run AFTER all supabase/migrations/*.sql have been applied. Mirrors the
-- table-level grants Supabase applies automatically to its built-in
-- `anon` / `authenticated` roles — RLS policies (not these grants) are
-- what actually restricts access; this just puts every table within
-- reach of the RLS engine instead of failing on a bare permission check.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to anon;
grant service_role to postgres;
