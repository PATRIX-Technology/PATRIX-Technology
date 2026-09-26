import { z } from 'zod';
import type { Locale } from '@/i18n/config';
import { ARABIC_POSSESSIVE_SUFFIX, arabicVerb, englishPronoun, isArabicVerbKey, type Pronoun } from './pronouns';

export const TemplatePageSchema = z.object({
  order: z.number().int().min(1),
  text: z.string().min(1),
  image_prompt: z.string().min(1),
});
export type TemplatePage = z.infer<typeof TemplatePageSchema>;

export const StoryThemeTemplateSchema = z.object({
  id: z.string().uuid(),
  theme_key: z.string(),
  locale: z.enum(['en', 'ar']),
  title: z.string(),
  synopsis: z.string(),
  mascot_name: z.string(),
  pages: z.array(TemplatePageSchema),
  native_review_status: z.enum(['draft', 'reviewed']),
  is_active: z.boolean(),
});
export type StoryThemeTemplate = z.infer<typeof StoryThemeTemplateSchema>;

export interface TokenContext {
  childName: string;
  pronoun: Pronoun;
  organisation: string;
  mascot: string;
  locale: Locale;
}

/**
 * Thrown when generation is attempted from a template that hasn't cleared
 * native review yet. This is a hard stop, not a warning — see
 * docs/DECISIONS.md "Arabic content gating".
 */
export class TemplateNotReviewedError extends Error {
  constructor(themeKey: string, locale: Locale) {
    super(`Template "${themeKey}" (${locale}) is still in draft and has not passed native review.`);
    this.name = 'TemplateNotReviewedError';
  }
}

export function assertTemplateUsable(template: StoryThemeTemplate): void {
  if (template.locale === 'ar' && template.native_review_status !== 'reviewed') {
    throw new TemplateNotReviewedError(template.theme_key, template.locale);
  }
  if (!template.is_active) {
    throw new Error(`Template "${template.theme_key}" (${template.locale}) is not active.`);
  }
}

const SIMPLE_TOKEN = /\{(child_name|organisation|mascot)\}/g;
const PRONOUN_TOKEN = /\{pronoun:(subject|possessive|object)(_cap)?\}/g;
const ARABIC_VERB_TOKEN = /\{v:([a-z_]+)\}/g;
// Fuses directly onto a preceding Arabic word stem with no space (e.g.
// "عائلت{ps}" -> "عائلتها") — see ARABIC_POSSESSIVE_SUFFIX in pronouns.ts.
const ARABIC_POSSESSIVE_TOKEN = /\{ps\}/g;

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

/**
 * Renders template text/image_prompt strings for one page of one story.
 * Pure function — no I/O — so it is exhaustively unit-testable without a
 * database. See tests/unit/templates.test.ts.
 */
export function renderTokens(input: string, ctx: TokenContext): string {
  let output = input.replace(SIMPLE_TOKEN, (_match, key: 'child_name' | 'organisation' | 'mascot') => {
    if (key === 'child_name') return ctx.childName;
    if (key === 'organisation') return ctx.organisation;
    return ctx.mascot;
  });

  output = output.replace(
    PRONOUN_TOKEN,
    (_match, form: 'subject' | 'possessive' | 'object', cap: string | undefined) => {
      const resolved =
        ctx.locale === 'ar'
          // Arabic pronoun-form tokens are not used directly in Arabic
          // templates (they use {v:...} verb slots instead); fall back to
          // the subject pronoun word for safety if one slips in.
          ? arabicVerb('subject_pronoun', ctx.pronoun)
          : englishPronoun(ctx.pronoun, form);
      return cap ? capitalize(resolved) : resolved;
    },
  );

  if (ctx.locale === 'ar') {
    output = output.replace(ARABIC_VERB_TOKEN, (match, key: string) => {
      if (!isArabicVerbKey(key)) return match;
      return arabicVerb(key, ctx.pronoun);
    });
    output = output.replace(ARABIC_POSSESSIVE_TOKEN, () => ARABIC_POSSESSIVE_SUFFIX[ctx.pronoun]);
  }

  return output;
}

export function renderTemplatePage(page: TemplatePage, ctx: TokenContext): TemplatePage {
  return {
    order: page.order,
    text: renderTokens(page.text, ctx),
    image_prompt: renderTokens(page.image_prompt, ctx),
  };
}

export function renderTemplate(
  template: StoryThemeTemplate,
  ctx: Omit<TokenContext, 'mascot' | 'locale'>,
): TemplatePage[] {
  assertTemplateUsable(template);
  const fullCtx: TokenContext = { ...ctx, mascot: template.mascot_name, locale: template.locale };
  return template.pages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((page) => renderTemplatePage(page, fullCtx));
}
