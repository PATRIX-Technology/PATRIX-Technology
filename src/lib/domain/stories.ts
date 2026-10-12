import type { SupabaseClient } from '@supabase/supabase-js';
import { renderTemplate, type StoryThemeTemplate } from './templates';
import type { AppLocale, AvatarConfig, Pronoun } from '@/types/database';

/** How many times a human can manually click "regenerate this page" —
 * total, across every page of one story, for every subscription tier —
 * each click is a real, paid Gemini image call. Deliberately a cost
 * control, not a UX nicety: a per-PAGE cap (the previous value, 3) could
 * burn up to 18 extra Gemini calls on one 6-page story. Shared between
 * the enforcing Server Action (regeneratePageAction), the real
 * enforcement boundary in the regenerate_story_page SECURITY DEFINER RPC
 * (migration 0040), and the story detail page, which uses it to grey out
 * every page's button once the story's shared allowance is used rather
 * than only finding out after clicking. See docs/DECISIONS.md
 * "Regeneration limit: once per story, not per page". */
export const MAX_MANUAL_REGENERATIONS_PER_STORY = 1;

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
  /** When set, generates a bilingual-in-one-book story: every interior
   * page carries BOTH an English and an Arabic caption (see
   * docs/DECISIONS.md "Bilingual-in-one-book generation"). `template`
   * above stays the PRIMARY-locale template (drives `locale`, and which
   * name shows first elsewhere); `bilingualTemplate` is the other
   * locale's row for the same theme_key, used only to render the second
   * language's captions. Both `childNameEn`/`childNameAr` are required
   * together with this -- a bilingual book always needs both name
   * spellings, regardless of which locale is primary. */
  bilingualTemplate?: StoryThemeTemplate;
  childNameEn?: string;
  childNameAr?: string;
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
interface BilingualPageRow {
  page_number: number;
  text: string;
  text_ar: string;
  image_prompt: string;
}

/**
 * Renders a theme's EN and AR template rows together into one page array
 * per `order`: English caption + scene description as the base (always
 * used for the actual Gemini call -- no caption gets baked into the
 * image for a bilingual story, see docs/DECISIONS.md "Bilingual-in-one
 * -book generation"), with the Arabic caption folded in alongside it.
 * Each locale is independently token-substituted via its own template's
 * own placeholder conventions (English {pronoun:...}, Arabic
 * {v:...}/{ps} -- see src/lib/domain/templates.ts), so this just runs
 * the existing renderTemplate() twice rather than needing new rendering
 * logic.
 */
function renderBilingualPages(
  enTemplate: StoryThemeTemplate,
  arTemplate: StoryThemeTemplate,
  ctx: { childNameEn: string; childNameAr: string; pronoun: Pronoun; organisation: string },
): BilingualPageRow[] {
  const enPages = renderTemplate(enTemplate, {
    childName: ctx.childNameEn,
    pronoun: ctx.pronoun,
    organisation: ctx.organisation,
  });
  const arPages = renderTemplate(arTemplate, {
    childName: ctx.childNameAr,
    pronoun: ctx.pronoun,
    organisation: ctx.organisation,
  });
  const arTextByOrder = new Map(arPages.map((p) => [p.order, p.text]));

  return enPages.map((p) => ({
    page_number: p.order,
    text: p.text,
    text_ar: arTextByOrder.get(p.order) ?? '',
    image_prompt: p.image_prompt,
  }));
}

export async function createStoryForTenant(supabase: SupabaseClient, input: CreateStoryInput) {
  const bilingual = Boolean(input.bilingualTemplate);

  let rpcPages: { page_number: number; text: string; text_ar?: string; image_prompt: string }[];
  if (bilingual && input.bilingualTemplate) {
    const isTemplateEn = input.template.locale === 'en';
    const enTemplate = isTemplateEn ? input.template : input.bilingualTemplate;
    const arTemplate = isTemplateEn ? input.bilingualTemplate : input.template;
    rpcPages = renderBilingualPages(enTemplate, arTemplate, {
      childNameEn: input.childNameEn ?? input.childName,
      childNameAr: input.childNameAr ?? input.childName,
      pronoun: input.pronoun,
      organisation: input.organisationName,
    });
  } else {
    // renderTemplate() itself throws TemplateNotReviewedError for an
    // unreviewed Arabic template — preserved unchanged from createStory().
    const pages = renderTemplate(input.template, {
      childName: input.childName,
      pronoun: input.pronoun,
      organisation: input.organisationName,
    });
    rpcPages = pages.map((page) => ({ page_number: page.order, text: page.text, image_prompt: page.image_prompt }));
  }

  const { data: storyId, error } = await supabase.rpc('create_story', {
    target_tenant_id: input.tenantId,
    target_child_id: input.childId,
    target_theme_key: input.template.theme_key,
    target_locale: input.locale,
    target_avatar_config: input.avatarConfig,
    target_pronoun: input.pronoun,
    pages: rpcPages,
    target_bilingual: bilingual,
  });

  if (error) {
    if (error.message.includes('granted consent')) throw new ConsentRequiredError();
    if (error.message.includes('used all the stories')) throw new QuotaExceededError();
    throw error;
  }

  return { id: storyId as string };
}
