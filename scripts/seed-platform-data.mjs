// Seeds platform-required data: story theme templates and subscription
// plans. Safe to re-run (upserts on unique keys). Requires
// SUPABASE_SERVICE_ROLE_KEY — never run this against production without
// reviewing supabase/seed/templates.json first.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in your Supabase project credentials first.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const templatesPath = fileURLToPath(new URL('../supabase/seed/templates.json', import.meta.url));
const templates = JSON.parse(readFileSync(templatesPath, 'utf8'));

const plans = [
  {
    key: 'starter',
    name: 'Starter',
    // Prices raised 1.5x across every tier from their original figures
    // (499/1299/3499 etc.) to restore the original ~82/72/48% margins
    // once the 8-page extension raised per-story AI cost by that same
    // 1.5x (4->6 images) -- see docs/en/pricing.md "Cost basis" and
    // docs/DECISIONS.md "Subscription prices raised 1.5x". Scaling price
    // by the exact same factor the cost rose preserves the margin % by
    // construction: (1.5P - 1.5C) / 1.5P = (P - C) / P.
    price_monthly_cents: 74900,
    price_annual_cents: 718500,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 25,
    suggestion_requests_per_month: 10,
    seats_included: 3,
    audience: 'nursery',
  },
  {
    key: 'growth',
    name: 'Growth',
    price_monthly_cents: 194900,
    price_annual_cents: 1873500,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 100,
    suggestion_requests_per_month: 20,
    seats_included: 10,
    audience: 'nursery',
  },
  {
    key: 'network',
    name: 'Network',
    price_monthly_cents: 524900,
    price_annual_cents: 5023500,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 500,
    suggestion_requests_per_month: 30,
    seats_included: 50,
    audience: 'nursery',
  },
  // USD twins of the three AED nursery tiers above, for a nursery outside
  // the UAE -- see docs/DECISIONS.md "USD pricing for nursery plans".
  // Same key prefix + `_usd` suffix as the AED row, same
  // stories_per_month/seats_included, converted from the AED price at
  // the UAE's pegged rate (~3.6725 AED/USD) and rounded to a clean
  // number rather than kept as an odd converted decimal -- a provisional
  // number, not a researched international price point; flagged for the
  // founder to revisit once real market/competitor pricing is looked
  // into. Annual price applies the same ~20% discount the AED tiers
  // already use.
  {
    key: 'starter_usd',
    name: 'Starter',
    price_monthly_cents: 19900,
    price_annual_cents: 194900,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 25,
    suggestion_requests_per_month: 10,
    seats_included: 3,
    audience: 'nursery',
  },
  {
    key: 'growth_usd',
    name: 'Growth',
    price_monthly_cents: 52500,
    price_annual_cents: 502500,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 100,
    suggestion_requests_per_month: 20,
    seats_included: 10,
    audience: 'nursery',
  },
  {
    key: 'network_usd',
    name: 'Network',
    price_monthly_cents: 142500,
    price_annual_cents: 1366500,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 500,
    suggestion_requests_per_month: 30,
    seats_included: 50,
    audience: 'nursery',
  },
  {
    key: 'family',
    name: 'Family',
    // Raised 9 -> 14 and 19 -> 29 (same 1.5x reasoning as the nursery
    // tiers above) -- family's per-story AI cost rose the same way,
    // and the founder asked for this applied to every tier, not only
    // the nursery side.
    price_monthly_cents: 1400,
    price_annual_cents: 13500,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 1,
    suggestion_requests_per_month: 3,
    seats_included: 1,
    audience: 'family',
  },
  {
    key: 'family_plus',
    name: 'Family Plus',
    price_monthly_cents: 2900,
    price_annual_cents: 28500,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 3,
    suggestion_requests_per_month: 5,
    seats_included: 1,
    audience: 'family',
  },
  // AED twins of the two family tiers above -- same `_aed` suffix
  // pattern as the nursery USD twins use (base key = primary currency,
  // suffixed key = secondary), just inverted: USD is primary for family
  // (a global/individual product), AED is the secondary twin here,
  // where nursery has it the other way around. Converted at the same
  // ~3.6725 AED/USD peg, rounded to the nearest AED 5 -- a provisional
  // number, not researched UAE consumer pricing; same caveat as the
  // nursery USD twins. BillingSection.tsx already renders a currency
  // toggle automatically once more than one currency exists for an
  // audience -- no UI change needed for these to appear.
  {
    key: 'family_aed',
    name: 'Family',
    price_monthly_cents: 5000,
    price_annual_cents: 49500,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 1,
    suggestion_requests_per_month: 3,
    seats_included: 1,
    audience: 'family',
  },
  {
    key: 'family_plus_aed',
    name: 'Family Plus',
    price_monthly_cents: 10500,
    price_annual_cents: 104500,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 3,
    suggestion_requests_per_month: 5,
    seats_included: 1,
    audience: 'family',
  },
];

async function main() {
  console.log(`Upserting ${templates.length} story templates...`);
  const { error: templatesError } = await supabase
    .from('story_theme_templates')
    .upsert(templates, { onConflict: 'theme_key,locale' });
  if (templatesError) throw templatesError;

  console.log(`Upserting ${plans.length} plans...`);
  const { error: plansError } = await supabase.from('plans').upsert(plans, { onConflict: 'key' });
  if (plansError) throw plansError;

  console.log('Platform data seeded successfully.');
}

main().catch((error) => {
  console.error('Seeding failed:', error.message ?? error);
  process.exit(1);
});
