// Creates/reuses the Stripe Products and Prices every paid plan needs for
// subscription checkout, then saves the resulting Price IDs back onto each
// `plans` row (stripe_price_id_monthly / stripe_price_id_annual).
//
// Why this exists: subscription checkout (src/app/api/billing/checkout/route.ts)
// looks up plan.stripe_price_id_monthly / _annual and 409s with "This plan
// has no Stripe price configured" if either is null. As of 16 Oct 2026 all
// 10 live plan rows have both columns null, so subscription checkout cannot
// work at all today — this script is the fix.
//
// Safe to re-run: Products are created with a deterministic id
// (`ownly_<plan.key>`) and Prices with a deterministic `lookup_key`
// (`<plan.key>_monthly` / `_annual`), so a second run finds and reuses what
// the first run created instead of duplicating it.
//
// Requires your own Stripe secret key — this script never asks the
// assistant for one. Run with:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-plans.mjs
// (or put STRIPE_SECRET_KEY in .env.local). Mirrors the same live-key
// safety check as src/lib/billing/stripe.ts: refuses an sk_live_ key unless
// STRIPE_MODE=live is also set, since this app is deliberately kept in
// Stripe test mode until that's a separate, explicit decision — see
// docs/DECISIONS.md "Billing stays in Stripe test mode".
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in your Supabase project credentials first.',
  );
  process.exit(1);
}
if (!stripeSecretKey) {
  console.error(
    'Missing STRIPE_SECRET_KEY. Get it from https://dashboard.stripe.com/test/apikeys and either\n' +
      'export it or add it to .env.local, then re-run.',
  );
  process.exit(1);
}
if (process.env.STRIPE_MODE !== 'live' && stripeSecretKey.startsWith('sk_live_')) {
  console.error(
    'Refusing to run against a live Stripe secret key while STRIPE_MODE is not explicitly "live". ' +
      'This app is deliberately kept in Stripe test mode — see docs/DECISIONS.md. ' +
      'Use a sk_test_ key, or set STRIPE_MODE=live if you have made that decision deliberately.',
  );
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey);
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

async function findOrCreateProduct(plan) {
  const productId = `ownly_${plan.key}`;
  try {
    return await stripe.products.retrieve(productId);
  } catch (error) {
    if (error.code !== 'resource_missing') throw error;
  }
  return stripe.products.create({
    id: productId,
    name: `Ownly — ${plan.name} (${plan.currency})`,
    metadata: { ownly_plan_key: plan.key },
  });
}

async function findOrCreatePrice({ product, plan, interval, amountCents, lookupKey }) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0) return existing.data[0];
  return stripe.prices.create({
    product: product.id,
    currency: plan.currency.toLowerCase(),
    unit_amount: amountCents,
    recurring: { interval },
    lookup_key: lookupKey,
    metadata: { ownly_plan_key: plan.key },
  });
}

async function main() {
  const { data: plans, error } = await supabase
    .from('plans')
    .select(
      'id, key, name, currency, price_monthly_cents, price_annual_cents, stripe_price_id_monthly, stripe_price_id_annual',
    )
    .eq('is_active', true);
  if (error) throw error;

  console.log(`Found ${plans.length} active plans.`);

  for (const plan of plans) {
    if (plan.stripe_price_id_monthly && plan.stripe_price_id_annual) {
      console.log(`${plan.key}: already has both Price IDs, skipping.`);
      continue;
    }

    const product = await findOrCreateProduct(plan);

    const monthlyPrice = await findOrCreatePrice({
      product,
      plan,
      interval: 'month',
      amountCents: plan.price_monthly_cents,
      lookupKey: `${plan.key}_monthly`,
    });
    const annualPrice = await findOrCreatePrice({
      product,
      plan,
      interval: 'year',
      amountCents: plan.price_annual_cents,
      lookupKey: `${plan.key}_annual`,
    });

    const { error: updateError } = await supabase
      .from('plans')
      .update({
        stripe_price_id_monthly: monthlyPrice.id,
        stripe_price_id_annual: annualPrice.id,
      })
      .eq('id', plan.id);
    if (updateError) throw updateError;

    console.log(`${plan.key}: monthly=${monthlyPrice.id} annual=${annualPrice.id}`);
  }

  console.log('Done. Subscription checkout now has a real Stripe price for every active plan.');
}

main().catch((err) => {
  console.error('Stripe plan setup failed:', err.message ?? err);
  process.exit(1);
});
