-- ============================================================================
-- 0031_require_aal2_for_platform_owner.sql
-- Security audit finding: MFA for the platform owner was only checked at
-- page load (getMfaStatus() in src/lib/domain/mfa.ts, gating the owner
-- dashboard's layout), never by the database itself. is_platform_owner()
-- -- used throughout this schema's RLS policies to grant full,
-- cross-tenant read/write access -- only ever checked the profiles.
-- is_platform_owner flag, with no regard for whether THIS SESSION had
-- actually completed the MFA step-up. A valid but not-yet-elevated
-- access token (aal1) for the owner's account -- e.g. one issued right
-- after password sign-in, before the MFA challenge page ran -- would
-- still pass every is_platform_owner() check in the database, even
-- though the app's own UI would have redirected that same session to
-- /owner/mfa-challenge first.
--
-- Fixed by requiring the session's Authenticator Assurance Level to
-- actually be 'aal2' (Supabase Auth's own claim for "this session
-- completed a second factor"), not just the static profile flag. This
-- mirrors, at the database layer, exactly what getMfaStatus() already
-- enforces client-side -- see docs/DECISIONS.md "Owner MFA is mandatory,
-- not optional".
-- ============================================================================

create or replace function is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_owner from profiles where id = auth.uid())
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2',
    false
  );
$$;
