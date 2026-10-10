'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import {
  createStoryForTenant,
  ConsentRequiredError,
  QuotaExceededError,
  MAX_MANUAL_REGENERATIONS_PER_PAGE,
} from '@/lib/domain/stories';
import { renderTemplate, StoryThemeTemplateSchema, type StoryThemeTemplate } from '@/lib/domain/templates';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import { MAX_CSV_IMPORT_ROWS } from '@/lib/domain/children';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { runWorkerOnce } from '@/lib/jobs/worker';
import { errorMessage } from '@/lib/errors';
import type { ActionResult } from './auth';

/** Each regeneration costs a real Gemini image call — generous enough for
 * legitimately fixing several pages in one sitting, tight enough to stop
 * someone hammering the button. Per user, not per page/story, so it
 * still bites even if they spread clicks across different stories. */
const REGENERATE_RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

export interface CreateStoryResult extends ActionResult {
  storyId?: string;
}

/**
 * Deliberately returns { storyId } instead of calling next/navigation's
 * redirect() on success — see docs/DECISIONS.md "Client-side navigation
 * instead of redirect() inside a useFormState action" for why: every
 * hard-to-reproduce client-side crash reported on this exact page
 * ("generating a story") involved a Server Action that redirected from
 * inside a useFormState-driven form. CreateStoryForm now navigates
 * itself, client-side, once storyId appears in the resolved state.
 */
export async function createStoryAction(
  locale: string,
  childId: string,
  formData: FormData,
): Promise<CreateStoryResult> {
  const templateId = String(formData.get('templateId') ?? '');
  if (!templateId) return { error: 'Please choose a theme.' };

  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const { data: child } = await supabase
    .from('children')
    .select('*')
    .eq('id', childId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!child) return { error: 'Child not found.' };

  const { data: templateRow } = await supabase
    .from('story_theme_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (!templateRow) return { error: 'Theme not found.' };

  const template = StoryThemeTemplateSchema.parse(templateRow);

  // An Arabic story must use the child's Arabic name, never the Latin
  // one sitting mid-sentence ("...جلست بجانب Hala...") — this used to
  // silently fall back to the Latin name when none was on file, which
  // is exactly how that happened for real; see docs/DECISIONS.md
  // "Arabic name is required, not a silent fallback". Hard-block
  // instead, so this can never happen again for any child.
  if (template.locale === 'ar' && !child.arabic_first_name) {
    return {
      error: `${child.first_name} needs an Arabic name on file before an Arabic story can be created — add it on the child's profile first.`,
    };
  }
  const childName = template.locale === 'ar' ? child.arabic_first_name : child.first_name;

  let story: { id: string };
  try {
    story = await createStoryForTenant(supabase, {
      tenantId: context.tenantId,
      childId: child.id,
      childName,
      pronoun: child.pronoun,
      consentStatus: child.consent_status,
      avatarConfig: parseAvatarConfig(child.avatar_config),
      organisationName: context.tenantName,
      template,
      locale: template.locale,
      createdBy: context.userId,
    });
  } catch (error) {
    if (error instanceof ConsentRequiredError || error instanceof QuotaExceededError) {
      return { error: error.message };
    }
    return { error: (error as Error).message };
  }

  // Deliberately NOT kicking the job worker here anymore — see
  // docs/DECISIONS.md "Story creation no longer waits on the worker
  // before redirecting". This used to run synchronously so images
  // started generating right away, but with the real provider that
  // could take long enough on a multi-page story to hit Vercel's 60s
  // function timeout — and when it did, the browser never got ANY
  // response back, so CreateStoryForm's client-side router.push() never
  // fired: the whole point of returning storyId instead of calling
  // next/navigation's redirect() from in here. The story page itself
  // now kicks the worker on load instead, where a slow run just means a
  // slower page load, not a request that vanishes with no redirect.

  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  revalidatePath(`/${locale}/dashboard/stories`);
  // CreateStoryForm navigates to this story's page itself, client-side,
  // once it sees storyId — see the note on CreateStoryResult above for
  // why this doesn't call redirect() here directly.
  return { storyId: story.id };
}

export async function approveStoryAction(locale: string, storyId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('approve_story', { target_story_id: storyId });
  if (error) return { error: error.message };
  revalidatePath(`/${locale}/dashboard/stories/${storyId}`);
  return {};
}

export async function rejectStoryAction(locale: string, storyId: string, reason: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reject_story', { target_story_id: storyId, reason });
  if (error) return { error: error.message };
  revalidatePath(`/${locale}/dashboard/stories/${storyId}`);
  return {};
}

export async function regeneratePageAction(locale: string, storyId: string, pageId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  // Re-render this page's caption text from the live template before
  // regenerating its image, rather than reusing whatever text was
  // stored at the story's original creation time. Templates get fixed
  // (see docs/DECISIONS.md "Arabic gender-agreement audit of the story
  // templates") — without this, "Regenerate this page" would keep
  // reproducing an old, already-corrected mistake forever. Best-effort:
  // if any lookup here fails, fall through and regenerate the image
  // with the existing text rather than blocking the whole action.
  const { data: page } = await supabase
    .from('story_pages')
    .select('page_number, text, regenerate_count')
    .eq('id', pageId)
    .eq('story_id', storyId)
    .maybeSingle();
  const { data: story } = await supabase
    .from('stories')
    .select('theme_key, locale, pronoun_snapshot, tenant_id, child_id, status')
    .eq('id', storyId)
    .maybeSingle();
  if (!page || !story) return { error: 'Page not found.' };

  // A story is finalized once approved -- see docs/DECISIONS.md "Cap
  // manual page regeneration per page and block it after approval". The
  // button is already hidden once a story reaches this status; this is
  // the defense-in-depth check for a stale page or cached form.
  if (story.status === 'APPROVED') {
    return { error: 'This story has already been approved and can no longer be regenerated.' };
  }

  if (page.regenerate_count >= MAX_MANUAL_REGENERATIONS_PER_PAGE) {
    return {
      error: `This page has already been regenerated ${MAX_MANUAL_REGENERATIONS_PER_PAGE} times, the limit per page. Contact support if it still needs fixing.`,
    };
  }

  try {
    await enforceRateLimit(`regenerate:${context.userId}`, REGENERATE_RATE_LIMIT.limit, REGENERATE_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  let refreshedText: string | undefined;
  const [{ data: templateRow }, { data: child }, { data: tenant }] = await Promise.all([
    supabase
      .from('story_theme_templates')
      .select('*')
      .eq('theme_key', story.theme_key)
      .eq('locale', story.locale)
      .maybeSingle(),
    supabase.from('children').select('first_name, arabic_first_name').eq('id', story.child_id).maybeSingle(),
    supabase.from('tenants').select('name').eq('id', story.tenant_id).maybeSingle(),
  ]);
  if (templateRow && child) {
    try {
      const template = StoryThemeTemplateSchema.parse(templateRow);
      const childName =
        story.locale === 'ar' && child.arabic_first_name ? child.arabic_first_name : child.first_name;
      const rendered = renderTemplate(template, {
        childName,
        pronoun: story.pronoun_snapshot,
        organisation: tenant?.name ?? context.tenantName,
      });
      refreshedText = rendered.find((p) => p.order === page.page_number)?.text;
    } catch {
      // Template failed validation/rendering — regenerate with the
      // existing text rather than blocking the user's request.
    }
  }

  // The actual writes (queueing the image job, bumping regenerate_count,
  // re-flipping the story to GENERATING) all happen inside the
  // regenerate_story_page SECURITY DEFINER RPC (migration 0030), not as
  // direct table writes from here — a security audit found the previous
  // direct-write version let any tenant member bypass the checks above
  // (already-approved, per-page cap) via a raw client call. The checks
  // above stay as early, friendlier error messages; the RPC re-enforces
  // both regardless, since it's the only thing actually allowed to write.
  const { error: rpcError } = await supabase.rpc('regenerate_story_page', {
    target_story_id: storyId,
    target_page_id: pageId,
    new_text: refreshedText ?? null,
  });
  if (rpcError) return { error: rpcError.message };

  // Not kicking the worker synchronously here either — see the note on
  // createStoryAction above. The story page itself picks this job up on
  // its next load/auto-refresh.
  revalidatePath(`/${locale}/dashboard/stories/${storyId}`);
  return {};
}

export async function redirectToReader(locale: string, storyId: string): Promise<void> {
  redirect(`/${locale}/dashboard/stories/${storyId}/reader`);
}

/**
 * Drives the story-generation queue forward from the browser, called by
 * WorkerKicker (a 'use client' component mounted on the story detail
 * page) instead of by that page's own server-render. The story page used
 * to call runWorkerOnce synchronously during its own SSR — every load AND
 * every 4-second AutoRefresh tick — which repeatedly re-exposed the page
 * itself to Vercel's 60-second function ceiling; a real multi-page story
 * hit it and crashed the whole page with a generic, unrecoverable client
 * exception. See docs/DECISIONS.md.
 *
 * The scheduled GitHub Actions cron (.github/workflows/story-worker-cron.yml,
 * every 5 minutes) remains the actual safety net for a closed tab, but
 * GitHub's own schedule trigger is explicitly best-effort and can be
 * delayed by hours under load — confirmed in production, not theoretical.
 * This action is the fast path: same runWorkerOnce, same service-role
 * client, same job queue, just invoked as its own separate request from
 * client-side JS. If IT is ever slow enough to hit a platform timeout,
 * that only fails this one fetch — caught by WorkerKicker and silently
 * retried next tick — never the page's own render.
 *
 * Not tenant-scoped: like the cron route, it claims whatever is next in
 * the GLOBAL queue (FOR UPDATE SKIP LOCKED-safe under concurrent
 * callers), same as every other trigger of this worker. Requires only an
 * authenticated session, not ownership of any particular story -- there
 * is nothing tenant-specific to leak, since the only output is a bare
 * processed/succeeded/failed count.
 */
export async function kickStoryWorkerAction(): Promise<{ processed: number } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  try {
    const serviceClient = createSupabaseServiceRoleClient();
    const result = await runWorkerOnce(serviceClient, 6);
    return { processed: result.processed };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export interface GenerationProgressResult {
  storyIds: string[];
  pagesGenerated: number;
  pagesTotal: number;
}

/**
 * Powers GenerationProgressBanner's poll — a lightweight read of how far
 * the tenant's currently-generating stories have gotten, aggregated
 * across all of them in one pair of queries rather than fetched per
 * story. Mounted at the dashboard layout level (see GenerationProgressBanner),
 * so this is the only way that banner — visible on every dashboard page,
 * not just a single story's own detail page — knows what's in flight.
 *
 * A story counts as "in progress" by its own status rather than by
 * checking every page's image_status directly: the worker (see
 * src/lib/jobs/worker.ts generatePageImage) already flips a story to
 * NEEDS_REVIEW the moment every page finishes, and to FAILED on a
 * terminal per-page failure, so DRAFT/QUEUED/GENERATING is exactly "not
 * yet settled" with no extra bookkeeping needed here.
 */
export async function getGenerationProgressAction(): Promise<GenerationProgressResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { storyIds: [], pagesGenerated: 0, pagesTotal: 0 };

  const { data: stories } = await supabase
    .from('stories')
    .select('id')
    .eq('tenant_id', context.tenantId)
    .in('status', ['DRAFT', 'QUEUED', 'GENERATING']);
  const storyIds = (stories ?? []).map((s) => s.id as string);
  if (storyIds.length === 0) return { storyIds: [], pagesGenerated: 0, pagesTotal: 0 };

  const { data: pages } = await supabase.from('story_pages').select('image_status').in('story_id', storyIds);

  const pagesTotal = pages?.length ?? 0;
  const pagesGenerated = (pages ?? []).filter((p) => p.image_status === 'GENERATED').length;

  return { storyIds, pagesGenerated, pagesTotal };
}

export interface BulkStoryResultRow {
  childId: string;
  childName: string;
  storyId?: string;
  error?: string;
}

export interface BulkStoryResult extends ActionResult {
  results?: BulkStoryResultRow[];
}

/**
 * Creates a story for several children at once from the same theme —
 * same single-story path as createStoryAction (createStoryForTenant ->
 * the create_story SECURITY DEFINER RPC), just looped, same pattern as
 * requestConsentBulkAction (see docs/DECISIONS.md "Bulk story generation
 * across the roster"). `themeKey` rather than a specific template row
 * id: each child's story renders in THAT child's own
 * preferred_language, matching how the single-child form already
 * auto-resolves locale from the child rather than forcing one language
 * on a mixed-language roster.
 *
 * Quota is enforced per call, inside the RPC, exactly as it is for a
 * single story — nothing here checks remaining quota up front. If a
 * tenant has only enough quota left for some of the selected children,
 * those stories succeed in order and the rest fail with
 * QuotaExceededError, reported per child in the results rather than
 * aborting the whole batch.
 */
export async function generateStoriesBulkAction(
  locale: string,
  childIds: string[],
  themeKey: string,
): Promise<BulkStoryResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const uniqueIds = Array.from(new Set(childIds));
  if (uniqueIds.length === 0) return { error: 'No children selected.' };
  if (uniqueIds.length > MAX_CSV_IMPORT_ROWS) {
    return { error: `You can generate stories for at most ${MAX_CSV_IMPORT_ROWS} children at once.` };
  }

  const { data: templateRows } = await supabase
    .from('story_theme_templates')
    .select('*')
    .eq('theme_key', themeKey)
    .eq('is_active', true);
  const templatesByLocale = new Map<string, StoryThemeTemplate>();
  for (const row of templateRows ?? []) {
    const parsed = StoryThemeTemplateSchema.safeParse(row);
    if (parsed.success) templatesByLocale.set(parsed.data.locale, parsed.data);
  }
  if (templatesByLocale.size === 0) return { error: 'Theme not found.' };

  const { data: children } = await supabase
    .from('children')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .in('id', uniqueIds);
  const childrenById = new Map((children ?? []).map((c) => [c.id as string, c]));

  const results: BulkStoryResultRow[] = [];

  for (const childId of uniqueIds) {
    const child = childrenById.get(childId);
    if (!child) {
      results.push({ childId, childName: childId, error: 'Child not found.' });
      continue;
    }

    const template = templatesByLocale.get(child.preferred_language);
    if (!template || template.native_review_status !== 'reviewed') {
      results.push({
        childId,
        childName: child.first_name,
        error: `This theme is not yet available in ${child.preferred_language === 'ar' ? 'Arabic' : 'English'}.`,
      });
      continue;
    }

    // Same hard block as the single-child form — see
    // docs/DECISIONS.md "Arabic name is required, not a silent
    // fallback".
    if (template.locale === 'ar' && !child.arabic_first_name) {
      results.push({
        childId,
        childName: child.first_name,
        error: `${child.first_name} needs an Arabic name on file before an Arabic story can be created.`,
      });
      continue;
    }
    const childName = template.locale === 'ar' ? child.arabic_first_name : child.first_name;

    try {
      const story = await createStoryForTenant(supabase, {
        tenantId: context.tenantId,
        childId: child.id,
        childName,
        pronoun: child.pronoun,
        consentStatus: child.consent_status,
        avatarConfig: parseAvatarConfig(child.avatar_config),
        organisationName: context.tenantName,
        template,
        locale: template.locale,
        createdBy: context.userId,
      });
      results.push({ childId, childName, storyId: story.id });
    } catch (error) {
      if (error instanceof ConsentRequiredError || error instanceof QuotaExceededError) {
        results.push({ childId, childName, error: error.message });
      } else {
        results.push({ childId, childName, error: errorMessage(error) });
      }
    }
  }

  revalidatePath(`/${locale}/dashboard/children`);
  revalidatePath(`/${locale}/dashboard/stories`);
  return { results };
}
