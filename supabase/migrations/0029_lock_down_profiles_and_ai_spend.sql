-- ============================================================================
-- 0029_lock_down_profiles_and_ai_spend.sql
-- Two privilege-escalation holes found in a security audit, both fixed
-- at the grant level (RLS alone was not enough for either):
--
-- 1. profiles_self_update/profiles_self_insert (migration 0001) let any
--    authenticated user write EVERY column of their own profile row,
--    including is_platform_owner -- RLS's `with check (id = auth.uid())`
--    only restricts which ROW you can touch, not which COLUMNS, and the
--    base Postgres GRANT UPDATE/INSERT was never scoped down from
--    Supabase's default "authenticated can touch its own tables" grant.
--    A single `supabase.from('profiles').update({is_platform_owner:true})`
--    from any freshly signed-up account was enough to grant full owner
--    access -- every tenant's data, every plan/quota, the AI kill
--    switch, story templates. No app code needs the broader grant:
--    every real profile row is created via a SECURITY DEFINER RPC
--    (create_tenant, create_family_tenant, accept_staff_invite, etc. --
--    see the `insert into profiles` call sites across earlier
--    migrations), and the only two legitimate CLIENT writes are
--    full_name (settings) and mfa_enrolled (markMfaEnrolledAction, a
--    display-only flag never read by the actual MFA gate -- that's
--    Supabase Auth's own AAL via getAuthenticatorAssuranceLevel(), see
--    src/lib/domain/mfa.ts).
--
-- 2. record_ai_spend (migration 0005) is SECURITY DEFINER but was never
--    revoked from anon/authenticated, unlike every sibling privileged
--    function in this codebase (claim_next_story_job,
--    sync_quota_to_plan, reward_referral, service_consume_story_quota).
--    Any signed-in user could call it directly to record a huge spend
--    (tripping the global kill switch and stopping generation for every
--    customer) or a negative amount (permanently defeating the spend
--    cap -- the running total only needs to stay under the cap, and a
--    large enough negative record makes that unreachable). Real Gemini
--    generation is already live in production, so this was a live,
--    immediately exploitable path to unlimited free/uncapped AI spend.
-- ============================================================================

revoke insert, update on profiles from anon, authenticated;
grant update (full_name, mfa_enrolled) on profiles to authenticated;
drop policy if exists "profiles_self_insert" on profiles;

revoke all on function record_ai_spend(uuid, uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function record_ai_spend(uuid, uuid, uuid, text, numeric) to service_role;

-- Belt-and-suspenders: reject a non-positive amount even if this ever
-- gets re-granted to a client role by mistake in the future.
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
  if amount <= 0 then
    raise exception 'record_ai_spend: amount must be positive (got %)', amount;
  end if;

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
  set current_period_spend_usd = current_period_spend_usd + amount, updated_at = now()
  where id = '00000000-0000-0000-0000-000000000001';

  update global_spend_cap
  set kill_switch = true
  where id = '00000000-0000-0000-0000-000000000001' and current_period_spend_usd >= monthly_cap_usd;
end;
$$;

revoke all on function record_ai_spend(uuid, uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function record_ai_spend(uuid, uuid, uuid, text, numeric) to service_role;
