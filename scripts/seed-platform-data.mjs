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
    price_monthly_cents: 49900,
    price_annual_cents: 479000,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 25,
    seats_included: 3,
    audience: 'nursery',
  },
  {
    key: 'growth',
    name: 'Growth',
    price_monthly_cents: 129900,
    price_annual_cents: 1249000,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 100,
    seats_included: 10,
    audience: 'nursery',
  },
  {
    key: 'network',
    name: 'Network',
    price_monthly_cents: 349900,
    price_annual_cents: 3349000,
    currency: 'AED',
    vat_inclusive: true,
    stories_per_month: 500,
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
    price_monthly_cents: 13500,
    price_annual_cents: 129900,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 25,
    seats_included: 3,
    audience: 'nursery',
  },
  {
    key: 'growth_usd',
    name: 'Growth',
    price_monthly_cents: 34900,
    price_annual_cents: 334900,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 100,
    seats_included: 10,
    audience: 'nursery',
  },
  {
    key: 'network_usd',
    name: 'Network',
    price_monthly_cents: 94900,
    price_annual_cents: 910900,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 500,
    seats_included: 50,
    audience: 'nursery',
  },
  {
    key: 'family',
    name: 'Family',
    price_monthly_cents: 900,
    price_annual_cents: 9000,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 1,
    seats_included: 1,
    audience: 'family',
  },
  {
    key: 'family_plus',
    name: 'Family Plus',
    price_monthly_cents: 1900,
    price_annual_cents: 19000,
    currency: 'USD',
    vat_inclusive: true,
    stories_per_month: 3,
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
