import type { SupabaseClient } from '@supabase/supabase-js';
import { renderTemplate, type StoryThemeTemplate } from './templates';
import type { AppLocale, AvatarConfig, Pronoun } from '@/types/database';

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

  const { data: quotaOk, error: quotaError } = await supabase.rpc('consume_story_quota', {
    target_tenant_id: input.tenantId,
  });
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
