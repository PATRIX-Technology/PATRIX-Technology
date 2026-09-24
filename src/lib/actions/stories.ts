'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { createStory, ConsentRequiredError, QuotaExceededError } from '@/lib/domain/stories';
import { StoryThemeTemplateSchema } from '@/lib/domain/templates';
import { runWorkerOnce } from '@/lib/jobs/worker';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import type { ActionResult } from './auth';

export async function createStoryAction(
  locale: string,
  childId: string,
  formData: FormData,
): Promise<ActionResult> {
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

  let story: { id: string };
  try {
    story = await createStory(supabase, {
      tenantId: context.tenantId,
      childId: child.id,
      childName: child.first_name,
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

  // Kick the job worker synchronously so the mock provider "generates"
  // images immediately in dev/demo rather than waiting for the next cron
  // tick. A real deployment relies on the scheduled trigger at
  // /api/cron/worker instead (see docs/DECISIONS.md "Job queue implementation").
  try {
    const serviceClient = createSupabaseServiceRoleClient();
    await runWorkerOnce(serviceClient, 25);
  } catch {
    // Non-fatal: the scheduled worker will pick the jobs up on its next run.
  }

  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  revalidatePath(`/${locale}/dashboard/stories`);
  // Send the user straight to the page that shows live per-page progress,
  // rather than leaving them on the child page with no feedback that
  // anything happened.
  redirect(`/${locale}/dashboard/stories/${story.id}`);
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

  const { error: pageError } = await supabase
    .from('story_pages')
    .update({ image_status: 'QUEUED', attempts: 0, last_error: null })
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
