import type { SupabaseClient } from '@supabase/supabase-js';
import { renderTemplate, type StoryThemeTemplate } from './templates';
import type { AppLocale, AvatarConfig, Pronoun } from '@/types/database';

/** How many times a human can manually click "regenerate this page" for
 * any one page — each click is a real, paid Gemini image call. Shared
 * between the enforcing Server Action (regeneratePageAction) and the
 * story detail page, which uses it to grey out the button once a page
 * hits the limit rather than only finding out after clicking. See
 * docs/DECISIONS.md "Cap manual page regeneration per page and block it
 * after approval". */
export const MAX_MANUAL_REGENERATIONS_PER_PAGE = 3;

export class QuotaExceededError extends Error {
  constructor() {
    super('This organisation has used all the stories included in its current plan period.');
    this.name = 'QuotaExceededError';
  }
}

export class ConsentRequiredError extends Error {
  constructor() {
    super('A story cannot be created until this child\'s parent has granted consent.');
    this.name = 'ConsentRequiredError';
  }
}

export interface CreateStoryInput {
  tenantId: string;
  childId: string;
  childName: string;
  pronoun: Pronoun;
  consentStatus: string;
  avatarConfig: AvatarConfig;
  organisationName: string;
  template: StoryThemeTemplate;
  locale: AppLocale;
  createdBy: string;
  /** Defaults to the real tenant-membership-checked RPC. Internal/admin
   * scripts running with the service role key (no tenant-member session)
   * pass 'service_consume_story_quota' instead -- see its migration for
   * why the auth check can't apply there. */
  quotaRpc?: 'consume_story_quota' | 'service_consume_story_quota';
}

/**
 * Creates a DRAFT story with its rendered pages, then queues one
 * GENERATE_PAGE_IMAGE job per page. Throws ConsentRequiredError /
 * QuotaExceededError rather than silently proceeding — callers (API
 * routes / server actions) should catch these and show a clear message
 * rather than letting generation start with no lawful basis or over quota.
 */
export async function createStory(supabase: SupabaseClient, input: CreateStoryInput) {
  if (input.consentStatus !== 'granted') {
    throw new ConsentRequiredError();
  }

  const { data: quotaOk, error: quotaError } = await supabase.rpc(
    input.quotaRpc ?? 'consume_story_quota',
    { target_tenant_id: input.tenantId },
  );
  if (quotaError) throw quotaError;
  if (!quotaOk) throw new QuotaExceededError();

  const pages = renderTemplate(input.template, {
    childName: input.childName,
    pronoun: input.pronoun,
    organisation: input.organisationName,
  });

  const { data: story, error: storyError } = await supabase
    .from('stories')
    .insert({
      tenant_id: input.tenantId,
      child_id: input.childId,
      theme_key: input.template.theme_key,
      locale: input.locale,
      status: 'QUEUED',
      avatar_config_snapshot: input.avatarConfig,
      pronoun_snapshot: input.pronoun,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (storyError) throw storyError;

  const { data: insertedPages, error: pagesError } = await supabase
    .from('story_pages')
    .insert(
      pages.map((page) => ({
        story_id: story.id,
        page_number: page.order,
        text: page.text,
        image_prompt: page.image_prompt,
      })),
    )
    .select();
  if (pagesError) throw pagesError;

  const { error: jobsError } = await supabase.from('story_jobs').insert(
    insertedPages.map((page) => ({
      story_id: story.id,
      page_id: page.id,
      job_type: 'GENERATE_PAGE_IMAGE',
    })),
  );
  if (jobsError) throw jobsError;

  await supabase.from('stories').update({ status: 'GENERATING' }).eq('id', story.id);

  return story;
}

/**
 * The real customer-facing path — used by createStoryAction, called with
 * the regular authenticated (RLS-governed) client. Unlike createStory()
 * above, the actual writes (consent check, quota consumption, story/
 * story_pages/story_jobs inserts) all happen inside the create_story
 * SECURITY DEFINER RPC (migration 0030), not as direct table inserts from
 * here — a security audit found that a tenant member calling Supabase
 * directly (bypassing this app's own code) could insert a story already
 * marked APPROVED, or a story_pages row with an arbitrary image_prompt,
 * skipping consent and quota entirely. Template rendering itself (pure
 * text substitution) stays here in TypeScript; only the guarded writes
 * moved into the RPC. See docs/DECISIONS.md "Full QA + security pass"
 * for the fuller writeup.
 */
export async function createStoryForTenant(supabase: SupabaseClient, input: CreateStoryInput) {
  // renderTemplate() itself throws TemplateNotReviewedError for an
  // unreviewed Arabic template — preserved unchanged from createStory().
  const pages = renderTemplate(input.template, {
    childName: input.childName,
    pronoun: input.pronoun,
    organisation: input.organisationName,
  });

  const { data: storyId, error } = await supabase.rpc('create_story', {
    target_tenant_id: input.tenantId,
    target_child_id: input.childId,
    target_theme_key: input.template.theme_key,
    target_locale: input.locale,
    target_avatar_config: input.avatarConfig,
    target_pronoun: input.pronoun,
    pages: pages.map((page) => ({
      page_number: page.order,
      text: page.text,
      image_prompt: page.image_prompt,
    })),
  });

  if (error) {
    if (error.message.includes('granted consent')) throw new ConsentRequiredError();
    if (error.message.includes('used all the stories')) throw new QuotaExceededError();
    throw error;
  }

  return { id: storyId as string };
}
