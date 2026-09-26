'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { createStory, ConsentRequiredError, QuotaExceededError } from '@/lib/domain/stories';
import { renderTemplate, StoryThemeTemplateSchema } from '@/lib/domain/templates';
import { runWorkerOnce } from '@/lib/jobs/worker';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import type { ActionResult } from './auth';

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

  // An Arabic story reads oddly with a Latin name sitting mid-sentence
  // ("...جلست بجانب Hala...") — use the Arabic spelling when one is on
  // file for this child, falling back to the Latin first name otherwise.
  // See docs/DECISIONS.md "Arabic name field for children".
  const childName =
    template.locale === 'ar' && child.arabic_first_name ? child.arabic_first_name : child.first_name;

  let story: { id: string };
  try {
    story = await createStory(supabase, {
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

  // Kick the job worker synchronously so images generate right away
  // instead of waiting for the scheduled trigger at /api/cron/worker.
  // With the real provider this can run long enough on a multi-page
  // story to risk Vercel's function timeout killing the request
  // mid-generation — see docs/DECISIONS.md "Defending against a
  // mid-generation function timeout" for why that no longer crashes the
  // page (CreateStoryForm now tolerates the resolved state coming back
  // undefined) even though it's left running synchronously here: the
  // /api/cron/worker safety net only actually runs on a schedule once
  // one is configured (see docs/NEEDS_FROM_ME.md), and removing this
  // synchronous call without that in place first would leave a
  // real-provider story stuck "queued" forever instead of just slow.
  try {
    const serviceClient = createSupabaseServiceRoleClient();
    await runWorkerOnce(serviceClient, 25);
  } catch {
    // Non-fatal: the scheduled worker will pick the jobs up on its next run.
  }

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
    .select('page_number, text')
    .eq('id', pageId)
    .eq('story_id', storyId)
    .maybeSingle();
  const { data: story } = await supabase
    .from('stories')
    .select('theme_key, locale, pronoun_snapshot, tenant_id, child_id')
    .eq('id', storyId)
    .maybeSingle();

  let refreshedText: string | undefined;
  if (page && story) {
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
          pronoun: story.pronoun_snapshot ?? 'they',
          organisation: tenant?.name ?? context.tenantName,
        });
        refreshedText = rendered.find((p) => p.order === page.page_number)?.text;
      } catch {
        // Template failed validation/rendering — regenerate with the
        // existing text rather than blocking the user's request.
      }
    }
  }

  const { error: pageError } = await supabase
    .from('story_pages')
    .update({
      image_status: 'QUEUED',
      attempts: 0,
      last_error: null,
      ...(refreshedText ? { text: refreshedText } : {}),
    })
    .eq('id', pageId)
    .eq('story_id', storyId);
  if (pageError) return { error: pageError.message };

  const { error: jobError } = await supabase
    .from('story_jobs')
    .insert({ story_id: storyId, page_id: pageId, job_type: 'GENERATE_PAGE_IMAGE' });
  if (jobError) return { error: jobError.message };

  await supabase.from('stories').update({ status: 'GENERATING' }).eq('id', storyId);

  try {
    const serviceClient = createSupabaseServiceRoleClient();
    await runWorkerOnce(serviceClient, 5);
  } catch {
    // Picked up by the scheduled worker otherwise.
  }

  revalidatePath(`/${locale}/dashboard/stories/${storyId}`);
  return {};
}

export async function redirectToReader(locale: string, storyId: string): Promise<void> {
  redirect(`/${locale}/dashboard/stories/${storyId}/reader`);
}
