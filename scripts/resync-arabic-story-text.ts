// One-off migration: recompute every already-generated Arabic story
// page's caption text from the (now gender-fixed) live story templates,
// and queue a re-generation job for any page whose text actually
// changes — see docs/DECISIONS.md "Arabic gender-agreement audit of the
// story templates" for the bug this fixes.
//
// IMPORTANT: run `npm run db:seed` first. This script reads the
// templates that are LIVE in Supabase right now — if you haven't pushed
// the fixed supabase/seed/templates.json yet, it will just recompute the
// same old (wrong) text and report zero changes.
//
// Safe by default: prints a report and does nothing else. Pass --apply
// to actually update story_pages.text and queue GENERATE_PAGE_IMAGE jobs
// for the pages that changed (each queued job costs real money once a
// worker picks it up, if FEATURE_REAL_IMAGE_PROVIDER is on — the report
// shows an estimate before you decide).
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/load-env.mjs';
import { renderTemplate, StoryThemeTemplateSchema, type StoryThemeTemplate } from '../src/lib/domain/templates';
import type { Pronoun } from '../src/lib/domain/pronouns';

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in your Supabase project credentials first.',
  );
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

interface StoryRow {
  id: string;
  theme_key: string;
  pronoun_snapshot: Pronoun | null;
  tenant_id: string;
  child_id: string;
}

interface PageRow {
  id: string;
  story_id: string;
  page_number: number;
  text: string;
}

async function main() {
  console.log(apply ? 'Running in APPLY mode — this will write changes.' : 'Running in DRY-RUN mode (default) — no changes will be made. Pass --apply to actually fix stories.');
  console.log('');

  const { data: templateRows, error: templatesError } = await supabase
    .from('story_theme_templates')
    .select('*')
    .eq('locale', 'ar');
  if (templatesError) throw templatesError;

  const templatesByThemeKey = new Map<string, StoryThemeTemplate>();
  for (const row of templateRows ?? []) {
    templatesByThemeKey.set(row.theme_key, StoryThemeTemplateSchema.parse(row));
  }

  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('id, theme_key, pronoun_snapshot, tenant_id, child_id')
    .eq('locale', 'ar');
  if (storiesError) throw storiesError;
  if (!stories || stories.length === 0) {
    console.log('No Arabic stories found. Nothing to do.');
    return;
  }

  const childIds = [...new Set(stories.map((s) => s.child_id))];
  const tenantIds = [...new Set(stories.map((s) => s.tenant_id))];

  const [{ data: children, error: childrenError }, { data: tenants, error: tenantsError }] = await Promise.all([
    supabase.from('children').select('id, first_name, arabic_first_name').in('id', childIds),
    supabase.from('tenants').select('id, name').in('id', tenantIds),
  ]);
  if (childrenError) throw childrenError;
  if (tenantsError) throw tenantsError;

  const childById = new Map((children ?? []).map((c) => [c.id, c]));
  const tenantById = new Map((tenants ?? []).map((t) => [t.id, t]));

  let storiesAffected = 0;
  let pagesAffected = 0;
  let storiesSkippedNoTemplate = 0;
  const pagesToUpdate: { pageId: string; storyId: string; newText: string; pageNumber: number; childName: string; themeKey: string }[] = [];

  for (const story of stories as StoryRow[]) {
    const template = templatesByThemeKey.get(story.theme_key);
    if (!template) {
      storiesSkippedNoTemplate += 1;
      continue;
    }

    const child = childById.get(story.child_id);
    const tenant = tenantById.get(story.tenant_id);
    const childName = child?.arabic_first_name || child?.first_name || 'الطفل';
    const organisation = tenant?.name ?? 'Organisation';
    const pronoun: Pronoun = story.pronoun_snapshot ?? 'they';

    const rendered = renderTemplate(template, { childName, pronoun, organisation });

    const { data: pages, error: pagesError } = await supabase
      .from('story_pages')
      .select('id, story_id, page_number, text')
      .eq('story_id', story.id)
      .order('page_number');
    if (pagesError) throw pagesError;

    let storyHasChange = false;
    for (const page of (pages ?? []) as PageRow[]) {
      const newPage = rendered.find((p) => p.order === page.page_number);
      if (!newPage) continue;
      if (newPage.text !== page.text) {
        storyHasChange = true;
        pagesAffected += 1;
        pagesToUpdate.push({
          pageId: page.id,
          storyId: story.id,
          newText: newPage.text,
          pageNumber: page.page_number,
          childName,
          themeKey: story.theme_key,
        });
        console.log(`--- ${childName} / ${story.theme_key} / page ${page.page_number} (story ${story.id}) ---`);
        console.log(`  OLD: ${page.text}`);
        console.log(`  NEW: ${newPage.text}`);
      }
    }
    if (storyHasChange) storiesAffected += 1;
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Arabic stories scanned: ${stories.length}`);
  if (storiesSkippedNoTemplate > 0) {
    console.log(`Skipped (no matching live template for their theme_key): ${storiesSkippedNoTemplate}`);
  }
  console.log(`Stories with at least one wrong caption: ${storiesAffected}`);
  console.log(`Pages that would be corrected: ${pagesAffected}`);

  const realProvider = (process.env.FEATURE_REAL_IMAGE_PROVIDER ?? '').toLowerCase() === 'on'
    || (process.env.FEATURE_REAL_IMAGE_PROVIDER ?? '').toLowerCase() === 'true';
  const costPerImage = Number(process.env.GEMINI_COST_PER_IMAGE_USD ?? '0.02');
  if (pagesAffected > 0) {
    if (realProvider) {
      console.log(
        `Estimated regeneration cost if you --apply: ~$${(pagesAffected * costPerImage).toFixed(2)} ` +
          `(${pagesAffected} images x ~$${costPerImage.toFixed(3)} each, since real Gemini generation is on).`,
      );
    } else {
      console.log('Real image generation is off (mock provider) — regenerating these pages costs $0.');
    }
  }

  if (!apply) {
    console.log('');
    console.log('Nothing was changed. Re-run with --apply to fix these pages for real.');
    return;
  }

  if (pagesAffected === 0) {
    console.log('Nothing to apply.');
    return;
  }

  console.log('');
  console.log('Applying fixes...');
  const storiesToMarkGenerating = new Set<string>();
  for (const page of pagesToUpdate) {
    const { error: updateError } = await supabase
      .from('story_pages')
      .update({ text: page.newText, image_status: 'QUEUED', attempts: 0, last_error: null })
      .eq('id', page.pageId);
    if (updateError) throw updateError;

    const { error: jobError } = await supabase
      .from('story_jobs')
      .insert({ story_id: page.storyId, page_id: page.pageId, job_type: 'GENERATE_PAGE_IMAGE' });
    if (jobError) throw jobError;

    storiesToMarkGenerating.add(page.storyId);
  }

  for (const storyId of storiesToMarkGenerating) {
    const { error } = await supabase.from('stories').update({ status: 'GENERATING' }).eq('id', storyId);
    if (error) throw error;
  }

  console.log(`Updated ${pagesAffected} page(s) and queued their re-generation.`);
  console.log(
    'These will render with the corrected caption automatically once a worker run picks them up ' +
      '(the /api/cron/worker safety net, or the next time anyone opens the app and triggers a request).',
  );
}

main().catch((error) => {
  console.error('resync-arabic-story-text failed:', error.message ?? error);
  process.exit(1);
});
