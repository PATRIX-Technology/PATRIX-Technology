// Resets and re-seeds a self-contained DEMO tenant so a non-technical
// founder (or a reviewer) can click through every core flow without
// touching real customer data. Safe to re-run — it deletes and recreates
// the "demo-nursery" tenant every time. NEVER run this against a Supabase
// project that holds real customer/child data.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local first.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const DEMO_SLUG = 'demo-nursery';
const DEMO_PASSWORD = 'HikaytiDemo!2024';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function getOrCreateUser(email, fullName) {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);
  if (found) return found.id;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  await supabase.from('profiles').upsert({ id: data.user.id, full_name: fullName });
  return data.user.id;
}

async function main() {
  console.log('Cleaning up any previous demo tenant...');
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', DEMO_SLUG)
    .maybeSingle();
  if (existingTenant) {
    await supabase.from('tenants').delete().eq('id', existingTenant.id);
  }

  console.log('Creating demo staff accounts...');
  const ownerId = await getOrCreateUser('owner@demo.hikayti.com', 'Amina Al Farsi (Demo Owner)');
  const staffId = await getOrCreateUser('staff@demo.hikayti.com', 'Yusuf Rahman (Demo Staff)');

  console.log('Creating demo tenant...');
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: 'Little Explorers Nursery (Demo)',
      slug: DEMO_SLUG,
      default_locale: 'en',
      brand_primary_color: '#20949c',
    })
    .select()
    .single();
  if (tenantError) throw tenantError;

  await supabase.from('tenant_members').insert([
    { tenant_id: tenant.id, user_id: ownerId, role: 'nursery_owner' },
    { tenant_id: tenant.id, user_id: staffId, role: 'nursery_staff' },
  ]);

  await supabase.from('quotas').insert({
    tenant_id: tenant.id,
    stories_included_this_period: 25,
    stories_used_this_period: 1,
  });

  const { data: plan } = await supabase.from('plans').select('id').eq('key', 'starter').maybeSingle();
  if (plan) {
    await supabase.from('subscriptions').insert({
      tenant_id: tenant.id,
      plan_id: plan.id,
      status: 'trialing',
    });
  }

  console.log('Creating demo children...');
  const children = [
    {
      tenant_id: tenant.id,
      first_name: 'Maya',
      pronoun: 'she',
      class_name: 'Sunflower Class',
      preferred_language: 'en',
      avatar_config: { hair: 'curly_black', skinTone: 'medium', outfitColor: '#e5850c', accessory: 'glasses' },
      consent_status: 'granted',
    },
    {
      tenant_id: tenant.id,
      first_name: 'Zayd',
      pronoun: 'he',
      class_name: 'Sunflower Class',
      preferred_language: 'ar',
      avatar_config: { hair: 'short_brown', skinTone: 'light', outfitColor: '#187780', accessory: 'none' },
      consent_status: 'pending',
    },
    {
      tenant_id: tenant.id,
      first_name: 'Rami',
      pronoun: 'they',
      class_name: 'Starfish Class',
      preferred_language: 'en',
      avatar_config: { hair: 'curly_brown', skinTone: 'dark', outfitColor: '#ef4c2a', accessory: 'cap' },
      consent_status: 'withdrawn',
    },
  ];
  const { data: insertedChildren, error: childrenError } = await supabase
    .from('children')
    .insert(children)
    .select();
  if (childrenError) throw childrenError;

  const maya = insertedChildren.find((c) => c.first_name === 'Maya');
  const zayd = insertedChildren.find((c) => c.first_name === 'Zayd');
  const rami = insertedChildren.find((c) => c.first_name === 'Rami');

  console.log('Creating demo consent requests...');
  await supabase.from('consent_requests').insert([
    {
      tenant_id: tenant.id,
      child_id: maya.id,
      token_hash: sha256('demo-token-maya-granted'),
      status: 'granted',
      responded_at: new Date().toISOString(),
    },
    {
      tenant_id: tenant.id,
      child_id: zayd.id,
      token_hash: sha256('demo-token-zayd-pending'),
      status: 'pending',
    },
    {
      tenant_id: tenant.id,
      child_id: rami.id,
      token_hash: sha256('demo-token-rami-withdrawn'),
      status: 'withdrawn',
      responded_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      withdrawn_at: new Date().toISOString(),
    },
  ]);

  console.log('Creating a demo approved story for Maya...');
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .insert({
      tenant_id: tenant.id,
      child_id: maya.id,
      theme_key: 'healthy_eating',
      locale: 'en',
      status: 'APPROVED',
      avatar_config_snapshot: maya.avatar_config,
      created_by: staffId,
      approved_by: ownerId,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (storyError) throw storyError;

  const demoPages = [
    "At Little Explorers Nursery, Maya looked at her lunch tray and only saw white rice. \"Where did all the colours go?\" asked Marya the Fox, hopping onto the table.",
    'Marya the Fox pulled out a big basket. Inside were red tomatoes, orange carrots, yellow corn, green cucumbers, and purple grapes. "Every colour gives you a different superpower," Marya the Fox said.',
    'Maya tried a little bit of everything. The carrot was crunchy, the grapes were sweet, and the cucumber was cool and juicy. She giggled and asked for more.',
    'That night, Maya told the whole family about the rainbow plate. From then on, she always tried to fill her plate with as many colours as possible.',
  ];

  await supabase.from('story_pages').insert(
    demoPages.map((text, index) => ({
      story_id: story.id,
      page_number: index + 1,
      text,
      image_prompt: `Storybook illustration for page ${index + 1} of Maya's healthy eating story.`,
      image_asset_path: `demo/placeholder-page-${index + 1}.svg`,
      image_status: 'GENERATED',
      provider: 'mock',
    })),
  );

  await supabase.from('audit_logs').insert({
    tenant_id: tenant.id,
    actor_user_id: ownerId,
    action: 'demo_data_seeded',
    target_type: 'tenant',
    target_id: tenant.id,
    metadata: { children_count: insertedChildren.length },
  });

  console.log('\nDemo data ready.');
  console.log('  Tenant:', tenant.name);
  console.log('  Owner login: owner@demo.hikayti.com /', DEMO_PASSWORD);
  console.log('  Staff login: staff@demo.hikayti.com /', DEMO_PASSWORD);
}

main().catch((error) => {
  console.error('Demo seeding failed:', error.message ?? error);
  process.exit(1);
});
