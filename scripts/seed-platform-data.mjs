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
