-- ============================================================================
-- 0045_special_discount_percent.sql
-- An ad hoc, per-tenant discount percentage the founder can set from
-- /owner/subscriptions for a one-off negotiated price, independent of the
-- structured Founding Partner campaign (which is capped at 10 and fixed
-- at FOUNDING10's own percent_off). Null = no special discount.
--
-- See docs/DECISIONS.md "Special discount percent, independent of
-- Founding Partner".
-- ============================================================================

alter table tenants
  add column special_discount_percent smallint
    constraint special_discount_percent_range check (special_discount_percent between 1 and 99);

comment on column tenants.special_discount_percent is
  'Founder-set, one-off percent-off for this tenant''s Stripe checkout, independent of founding_partner_discount and not counted against FOUNDING10''s max_redemptions cap. Null means no special discount. Applied as a fresh, one-time (duration: once) Stripe coupon at checkout -- see src/app/api/billing/checkout/route.ts.';
