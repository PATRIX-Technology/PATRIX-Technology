-- ============================================================================
-- 0012_fix_pgcrypto_search_path.sql
-- Supabase installs pgcrypto into its own "extensions" schema, not public.
-- Every function below calls digest() (from pgcrypto) but was declared with
-- `set search_path = public`, so on a real Supabase project they fail with
-- "function digest(text, unknown) does not exist" — this only surfaces at
-- call time, which is why local testing against a plain Postgres (where
-- pgcrypto lands in public by default) never caught it. Widening
-- search_path to include extensions fixes all four without touching their
-- bodies.
-- ============================================================================

alter function get_consent_request_info(text) set search_path = public, extensions;
alter function respond_to_consent(text, consent_status) set search_path = public, extensions;
alter function get_gift_status(text) set search_path = public, extensions;
alter function redeem_gift(text, uuid) set search_path = public, extensions;
