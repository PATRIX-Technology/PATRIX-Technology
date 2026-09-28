// One-off: creates one real English story and one real Arabic story
// through the actual production pipeline (createStory + the real job
// worker, calling Gemini for real illustrations), then marks both as
// the platform sample stories (stories.is_platform_sample) used on the
// landing page and dashboard home. See docs/DECISIONS.md "Real sample
// stories generated for the landing/home page carousel".
//
// Costs real money (8 Gemini image calls, ~$1 each per docs/en/budget.md's
// cost basis) — only run this deliberately, not as part of any automated
// process.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from './lib/load-env.mjs';
import { createStory } from '../src/lib/domain/stories';
import { runWorkerOnce } from '../src/lib/jobs/worker';
import { StoryThemeTemplateSchema } from '../src/lib/domain/templates';

const STORAGE_BUCKET = 'story-assets';
const PUBLIC_DIR = join(process.cwd(), 'public', 'images', 'marketing', 'sample-stories');

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const THEME_KEY = 'healthy_eating';
const TENANT_SLUG = 'marketing-samples';

async function getOrCreateSampleTenant(): Promise<string> {
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

async function generateOne(locale: 'en' | 'ar', child: Awaited<ReturnType<typeof getOrCreateChild>>, tenantId: string) {
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
    createdBy: '00000000-0000-0000-0000-000000000000',
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

async function main() {
  const tenantId = await getOrCreateSampleTenant();

  const enChild = await getOrCreateChild(tenantId, { firstName: 'Amira', pronoun: 'she' });
  const arChild = await getOrCreateChild(tenantId, { firstName: 'Sultan', arabicFirstName: 'سلطان', pronoun: 'he' });

  const enStoryId = await generateOne('en', enChild, tenantId);
  const arStoryId = await generateOne('ar', arChild, tenantId);

  console.log('Waiting for generation to complete (this calls real Gemini for 8 images)...');
  await waitForCompletion([enStoryId, arStoryId]);

  console.log('Approving both stories...');
  await supabase
    .from('stories')
    .update({ status: 'APPROVED', approved_at: new Date().toISOString() })
    .in('id', [enStoryId, arStoryId])
    .eq('status', 'NEEDS_REVIEW');

  console.log('Clearing any previous platform samples and marking these two...');
  await supabase.from('stories').update({ is_platform_sample: false }).eq('is_platform_sample', true);
  await supabase.from('stories').update({ is_platform_sample: true }).in('id', [enStoryId, arStoryId]);

  console.log('Downloading generated images as static public files...');
  const manifest: Record<string, { pageNumber: number; text: string; publicPath: string }[]> = {};
  for (const [locale, storyId] of [['en', enStoryId] as const, ['ar', arStoryId] as const]) {
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
  console.log('EN sample story id:', enStoryId);
  console.log('AR sample story id:', arStoryId);
  console.log('Manifest written to', join(PUBLIC_DIR, 'manifest.json'));
}

main().catch((error) => {
  console.error('Sample story generation failed:', error);
  process.exit(1);
});
