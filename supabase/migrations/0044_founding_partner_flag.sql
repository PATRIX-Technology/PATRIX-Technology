-- ============================================================================
-- 0044_founding_partner_flag.sql
-- Lets the platform owner flag a specific tenant as one of the 10
-- Founding Partner nurseries from the owner dashboard, instead of relying
-- on the nursery owner knowing/typing the FOUNDING10 coupon code
-- themselves. See docs/DECISIONS.md "Founding Partner flag replaces
-- self-serve coupon code".
--
-- RLS: no new policy needed -- tenants_owner_update (migration 0001)
-- already allows is_platform_owner() to update any tenants row.
-- ============================================================================

alter table tenants add column founding_partner_discount boolean not null default false;

comment on column tenants.founding_partner_discount is
  'Set by the platform owner from /owner/subscriptions to grant this tenant the Founding Partner discount automatically at checkout, without the nursery needing to know a coupon code. Still gated by the FOUNDING10 coupon''s own eligibility window and max_redemptions -- see src/lib/domain/coupons.ts.';
