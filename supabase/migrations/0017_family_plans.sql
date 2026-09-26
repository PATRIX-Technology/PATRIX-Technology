-- ============================================================================
-- 0017_family_plans.sql
-- Family subscription plans were documented in docs/en/pricing.md
-- ("Family — new, not yet built") but the `plans` table had no way to
-- distinguish a nursery-priced plan from a family-priced one, and nothing
-- stopped a family tenant from buying a nursery tier (or vice versa) at
-- checkout. Adds an `audience` column reusing the existing `tenant_type`
-- enum ('nursery' | 'family') so plans and tenants speak the same
-- vocabulary. Existing Starter/Growth/Network rows default to 'nursery'
-- (unchanged); the two new Family/Family Plus rows are seeded separately
-- via scripts/seed-platform-data.mjs, matching how Starter/Growth/Network
-- are seeded, not inserted here.
-- ============================================================================

alter table plans add column audience tenant_type not null default 'nursery';

comment on column plans.audience is
  'Which kind of tenant this plan is priced for. Enforced at checkout (src/app/api/billing/checkout/route.ts) -- a nursery cannot buy a family-priced plan and vice versa.';
