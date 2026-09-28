// Implementation for generate-sample-stories.ts. Split out of that file
// because it imports app modules (createStory -> the job worker -> the
// image provider factory) that read feature-flag env vars at MODULE LOAD
// time -- ES module imports are hoisted above any top-level code in the
// same file, so a script that both calls loadEnv() and imports those
// modules at its own top level loads them before loadEnv() ever runs,
// permanently caching FEATURE_REAL_IMAGE_PROVIDER as unset (silently
// falling back to MockImageProvider even with the flag set in
// .env.local). generate-sample-stories.ts calls loadEnv() first, then
// dynamically imports this file, so its imports -- and everything they
// transitively import -- only evaluate after the env is loaded.
//
// Creates one real English story and one real Arabic story through the
// actual production pipeline (createStory + the real job worker, calling
// Gemini for real illustrations), then marks both as the platform sample
// stories (stories.is_platform_sample) used on the landing page and
// dashboard home. See docs/DECISIONS.md "Real sample stories generated
// for the landing/home page carousel".
//
// Costs real money (8 Gemini image calls, ~$1 each per docs/en/budget.md's
// cost basis) — only run this deliberately, not as part of any automated
// process.
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createStory } from '../src/lib/domain/stories';
import { runWorkerOnce } from '../src/lib/jobs/worker';
import { StoryThemeTemplateSchema } from '../src/lib/domain/templates';
import { flags } from '../src/lib/flags';

const STORAGE_BUCKET = 'story-assets';
const PUBLIC_DIR = join(process.cwd(), 'public', 'images', 'marketing', 'sample-stories');

if (!flags.realImageProvider) {
  console.error(
    'FEATURE_REAL_IMAGE_PROVIDER is not on -- refusing to generate the platform sample ' +
      'stories with the mock placeholder images. Set it in .env.local and try again.',
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const THEME_KEY = 'healthy_eating';
const TENANT_SLUG = 'marketing-samples';
const SYSTEM_USER_EMAIL = 'sample-stories@ownly.internal';

/** stories.created_by / tenant_members.user_id both reference auth.users,
 * so this script (which has no real signed-in user) needs one real auth
 * user to attribute its rows to. Never signed in to -- just a stable id. */
async function getOrCreateSystemUserId(): Promise<string> {
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  const found = existing.users.find((u) => u.email === SYSTEM_USER_EMAIL);
  if (found) return found.id;

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: SYSTEM_USER_EMAIL,
    email_confirm: true,
  });
  if (error) throw error;
  return created.user.id;
}

async function getOrCreateSampleTenant(systemUserId: string): Promise<string> {
  const { data: existing } = await supabase.from('tenants').select('id').eq('slug', TENANT_SLUG).maybeSingle();
  if (existing) return existing.id as string;

  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({ name: 'Ownly Marketing Samples', slug: TENANT_SLUG, default_locale: 'en' })
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from('quotas')
    .insert({ tenant_id: tenant.id, stories_included_this_period: 10, stories_used_this_period: 0 });
  await supabase.from('subscriptions').insert({ tenant_id: tenant.id });
  await supabase
    .from('tenant_members')
    .insert({ tenant_id: tenant.id, user_id: systemUserId, role: 'nursery_owner' });

  return tenant.id as string;
}

async function getOrCreateChild(tenantId: string, opts: {
  firstName: string;
  arabicFirstName?: string;
  pronoun: 'she' | 'he';
}): Promise<{ id: string; first_name: string; arabic_first_name: string | null; pronoun: string; consent_status: string; avatar_config: unknown }> {
  const { data: existing } = await supabase
    .from('children')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('first_name', opts.firstName)
    .maybeSingle();
  if (existing) return existing;

  const { data: child, error } = await supabase
    .from('children')
    .insert({
      tenant_id: tenantId,
      first_name: opts.firstName,
      arabic_first_name: opts.arabicFirstName ?? null,
      pronoun: opts.pronoun,
      class_name: 'Sample Class',
      preferred_language: opts.arabicFirstName ? 'ar' : 'en',
      avatar_config: { hair: 'curly_black', skinTone: 'medium', outfitColor: '#e5850c', accessory: 'none' },
      consent_status: 'granted',
    })
    .select()
    .single();
  if (error) throw error;
  return child;
}

async function generateOne(
  locale: 'en' | 'ar',
  child: Awaited<ReturnType<typeof getOrCreateChild>>,
  tenantId: string,
  systemUserId: string,
) {
  const { data: templateRow, error: templateError } = await supabase
    .from('story_theme_templates')
    .select('*')
    .eq('theme_key', THEME_KEY)
    .eq('locale', locale)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!templateRow) throw new Error(`No ${locale} template found for theme ${THEME_KEY}`);
  const template = StoryThemeTemplateSchema.parse(templateRow);

  const childName = locale === 'ar' ? child.arabic_first_name : child.first_name;
  if (!childName) throw new Error(`Child ${child.first_name} has no ${locale} name on file`);

  console.log(`Creating ${locale} story for ${childName}...`);
  const story = await createStory(supabase, {
    tenantId,
    childId: child.id,
    childName,
    pronoun: child.pronoun as 'she' | 'he',
    consentStatus: child.consent_status as string,
    avatarConfig: child.avatar_config as never,
    organisationName: 'Ownly Nursery (Sample)',
    template,
    locale,
    createdBy: systemUserId,
    quotaRpc: 'service_consume_story_quota',
  });
  console.log(`  story id: ${story.id}`);
  return story.id as string;
}

async function waitForCompletion(storyIds: string[]): Promise<void> {
  const maxWaitMs = 10 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const result = await runWorkerOnce(supabase, 25);
    console.log('worker run:', result);

    const { data: statuses } = await supabase.from('stories').select('id, status').in('id', storyIds);
    const allDone = (statuses ?? []).every((s) => s.status === 'NEEDS_REVIEW' || s.status === 'FAILED');
    if (allDone) {
      for (const s of statuses ?? []) {
        console.log(`  ${s.id}: ${s.status}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Timed out waiting for story generation to complete.');
}

/** Optional `--locale=en` / `--locale=ar` CLI filter, for regenerating
 * just one language's sample (e.g. retrying Arabic alone after Gemini
 * ignored the no-tashkeel instruction) without touching -- or having
 * to re-spend real money regenerating -- the other, already-good one. */
function targetLocales(): Array<'en' | 'ar'> {
  const arg = process.argv.find((a) => a.startsWith('--locale='));
  if (arg === '--locale=en') return ['en'];
  if (arg === '--locale=ar') return ['ar'];
  return ['en', 'ar'];
}

function readExistingManifest(): Record<string, { pageNumber: number; text: string; publicPath: string }[]> {
  const path = join(PUBLIC_DIR, 'manifest.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

async function main() {
  const locales = targetLocales();
  console.log(`Generating sample stor${locales.length > 1 ? 'ies' : 'y'} for: ${locales.join(', ')}`);

  const systemUserId = await getOrCreateSystemUserId();
  const tenantId = await getOrCreateSampleTenant(systemUserId);

  const enChild = locales.includes('en')
    ? await getOrCreateChild(tenantId, { firstName: 'Amira', pronoun: 'she' })
    : null;
  const arChild = locales.includes('ar')
    ? await getOrCreateChild(tenantId, { firstName: 'Sultan', arabicFirstName: 'سلطان', pronoun: 'he' })
    : null;

  const storyIds: Record<'en' | 'ar', string | null> = { en: null, ar: null };
  if (enChild) storyIds.en = await generateOne('en', enChild, tenantId, systemUserId);
  if (arChild) storyIds.ar = await generateOne('ar', arChild, tenantId, systemUserId);

  const newStoryIds = [storyIds.en, storyIds.ar].filter((id): id is string => Boolean(id));

  console.log(`Waiting for generation to complete (this calls real Gemini for ${newStoryIds.length * 4} images)...`);
  await waitForCompletion(newStoryIds);

  console.log('Approving...');
  await supabase
    .from('stories')
    .update({ status: 'APPROVED', approved_at: new Date().toISOString() })
    .in('id', newStoryIds)
    .eq('status', 'NEEDS_REVIEW');

  console.log('Clearing previous platform sample(s) for the regenerated locale(s) and marking the new one(s)...');
  for (const locale of locales) {
    await supabase.from('stories').update({ is_platform_sample: false }).eq('is_platform_sample', true).eq('locale', locale);
  }
  await supabase.from('stories').update({ is_platform_sample: true }).in('id', newStoryIds);

  console.log('Downloading generated images as static public files...');
  const manifest = readExistingManifest();
  for (const [locale, storyId] of [['en', storyIds.en] as const, ['ar', storyIds.ar] as const]) {
    if (!storyId) continue;
    const { data: storyPages, error } = await supabase
      .from('story_pages')
      .select('page_number, text, image_asset_path')
      .eq('story_id', storyId)
      .order('page_number', { ascending: true });
    if (error) throw error;

    const dir = join(PUBLIC_DIR, locale);
    mkdirSync(dir, { recursive: true });

    manifest[locale] = [];
    for (const page of storyPages ?? []) {
      if (!page.image_asset_path) throw new Error(`Page ${page.page_number} (${locale}) has no image`);
      const { data: blob, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(page.image_asset_path);
      if (downloadError || !blob) throw downloadError ?? new Error('Download failed');

      // Match whatever extension the worker actually saved under (see
      // src/lib/jobs/worker.ts's generatePageImage) rather than guessing.
      const ext = page.image_asset_path.split('.').pop();
      const filename = `page-${page.page_number}.${ext}`;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      writeFileSync(join(dir, filename), bytes);

      manifest[locale].push({
        pageNumber: page.page_number,
        text: page.text,
        publicPath: `/images/marketing/sample-stories/${locale}/${filename}`,
      });
      console.log(`  saved ${locale} page ${page.page_number} -> ${filename}`);
    }
  }
  writeFileSync(join(PUBLIC_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\nDone.');
  for (const [locale, storyId] of Object.entries(storyIds)) {
    if (storyId) console.log(`${locale.toUpperCase()} sample story id:`, storyId);
  }
  console.log('Manifest written to', join(PUBLIC_DIR, 'manifest.json'));
}

main().catch((error) => {
  console.error('Sample story generation failed:', error);
  process.exit(1);
});
