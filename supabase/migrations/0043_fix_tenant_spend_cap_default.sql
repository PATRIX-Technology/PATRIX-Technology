-- ============================================================================
-- 0043_fix_tenant_spend_cap_default.sql
-- A brand-new tenant's tenant_spend_caps row is lazily inserted by
-- record_ai_spend() on its FIRST real image, relying entirely on this
-- column's default for monthly_cap_usd -- nothing in application code
-- sets it otherwise (the only app-code reference to monthly_cap_usd is a
-- read-only display on the owner dashboard; no signup/checkout flow
-- writes it, unlike quotas which ARE synced to the paid plan). The
-- default was 0, so that very first real image immediately trips
-- kill_switch (0.10 >= 0), permanently blocking every real image after
-- it for that tenant until a human manually finds and raises their cap
-- in the database -- i.e. every brand-new real nursery/family signup
-- would get exactly one real illustration, ever, by default.
--
-- Raising the default to a safe interim ceiling (covers a full Starter
-- -tier month of real usage, ~25 stories x 6 images x $0.101 = ~$15,
-- with real headroom) so a new signup is never silently blocked on day
-- one. Proper per-plan cap sizing wired at checkout (same pattern as
-- quota sync, see src/lib/actions/billing) is a separate follow-up, not
-- yet built -- see docs/NEEDS_FROM_ME.md.
-- ============================================================================

alter table tenant_spend_caps alter column monthly_cap_usd set default 100.00;

-- Backfill any existing tenant with no row yet, so it doesn't hit the
-- same bug on its first real image before the default above applies.
insert into tenant_spend_caps (tenant_id, monthly_cap_usd)
select id, 100.00 from tenants
where id not in (select tenant_id from tenant_spend_caps)
on conflict (tenant_id) do nothing;
