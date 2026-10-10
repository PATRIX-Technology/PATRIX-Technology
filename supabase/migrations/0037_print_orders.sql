-- ============================================================================
-- 0037_print_orders.sql
-- Adds the ability to order a physical printed copy of an already-generated
-- digital storybook -- a one-off purchase, separate from the recurring
-- subscription that unlocks story credits (see supabase/migrations/0003+
-- for that). Deliberately minimal: no print-vendor integration exists yet
-- (see src/lib/providers/print/ -- a stub provider, same pattern as
-- RealImageProvider/MockImageProvider before Gemini was wired in), so this
-- migration only covers what's real today: recording the order, charging
-- for it via Stripe (test mode -- see docs/DECISIONS.md "Billing stays in
-- Stripe test mode"), and keeping customer shipping data isolated the same
-- way every other tenant-scoped table in this schema is.
-- ============================================================================

create type print_order_status as enum ('pending', 'paid', 'printing', 'shipped', 'cancelled');
create type print_order_currency as enum ('aed', 'usd');

create table print_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  status print_order_status not null default 'pending',
  currency print_order_currency not null,
  -- Smallest currency unit (fils for AED, cents for USD) -- same
  -- convention Stripe itself uses, so this never needs converting before
  -- being handed to price_data.unit_amount.
  amount_minor integer not null check (amount_minor > 0),
  shipping_name text not null check (char_length(shipping_name) between 1 and 120),
  shipping_phone text not null,
  shipping_address_line1 text not null check (char_length(shipping_address_line1) between 1 and 200),
  shipping_address_line2 text,
  shipping_city text not null check (char_length(shipping_city) between 1 and 100),
  shipping_country text not null check (char_length(shipping_country) = 2),
  -- The mandatory bilingual consent/sales-terms checkbox (see
  -- PrintOrderDialog.tsx) must be checked before this row can ever be
  -- inserted -- recorded here with a timestamp for the same reason every
  -- other consent in this schema is: so "they ticked the box" is provable
  -- later, not just assumed from the row existing.
  consent_accepted_at timestamptz not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index print_orders_tenant_id_idx on print_orders (tenant_id);
create index print_orders_story_id_idx on print_orders (story_id);

alter table print_orders enable row level security;

-- Tenant members can see and create their own organisation's print
-- orders. Nothing above 'pending' may be inserted directly -- status only
-- ever advances via the Stripe webhook (service role) or, later, a real
-- print-provider callback, same separation-of-concerns as
-- consent_requests/respond_to_consent.
create policy "print_orders_tenant_select" on print_orders
  for select using (is_tenant_member(tenant_id));

create policy "print_orders_tenant_insert" on print_orders
  for insert with check (is_tenant_member(tenant_id) and status = 'pending');

-- No update/delete policy for authenticated/anon -- status transitions
-- and payment-reference fields are written exclusively by the service
-- role from the Stripe webhook (src/app/api/billing/webhook/route.ts),
-- the same pattern already used for `subscriptions`.

alter table print_orders force row level security;
