-- ============================================================================
-- 0033_fix_respond_to_consent_search_path.sql
-- 0030_secure_story_creation_and_consent.sql replaced respond_to_consent()
-- to add the consent-decision trigger guard, but its `create or replace`
-- reset the function's search_path to `public` alone, silently undoing the
-- `public, extensions` fix from 0012_fix_pgcrypto_search_path.sql. Since
-- Supabase installs pgcrypto into "extensions", every real call to
-- respond_to_consent() (i.e. every parent clicking "I consent"/"I do not
-- consent" on a real consent link) has been failing in production with
-- "function digest(text, unknown) does not exist" since 0030 shipped --
-- found via a live end-to-end QA pass, not a report. No other function
-- redefined by 0030 calls digest(), so this is the only one needing the
-- same fix again.
-- ============================================================================

alter function respond_to_consent(text, consent_status) set search_path = public, extensions;
