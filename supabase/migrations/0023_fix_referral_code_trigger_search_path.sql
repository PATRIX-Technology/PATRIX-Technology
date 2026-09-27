-- ============================================================================
-- 0023_fix_referral_code_trigger_search_path.sql
-- get_advisors flagged generate_tenant_referral_code (0022) with a
-- mutable search_path -- it references no table, so there was no real
-- resolution risk, but every other function in this schema pins
-- search_path defensively and this one should too rather than being
-- the one silent exception.
-- ============================================================================

create or replace function generate_tenant_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;
