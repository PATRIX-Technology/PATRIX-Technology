-- ============================================================================
-- 0013_fix_global_spend_cap_update.sql
-- record_ai_spend's global_spend_cap update had no WHERE clause (it only
-- ever has one row, id '00000000-0000-0000-0000-000000000001', seeded in
-- 0005_spend_caps_audit.sql, so it didn't need one to be correct) — but
-- Supabase's Postgres runs with the safeupdate extension enabled, which
-- rejects any UPDATE/DELETE without a WHERE clause outright, regardless
-- of intent. This never showed up in local testing because plain
-- Postgres doesn't have that extension. Every real image generation was
-- failing at the spend-recording step because of this.
-- ============================================================================

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
