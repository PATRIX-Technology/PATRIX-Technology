import { describe, expect, it } from 'vitest';
import {
  assertTemplateUsable,
  renderTemplate,
  renderTokens,
  TemplateNotReviewedError,
  type StoryThemeTemplate,
} from '@/lib/domain/templates';

const baseTemplate: StoryThemeTemplate = {
  id: '11111111-1111-1111-1111-111111111111',
  theme_key: 'healthy_eating',
  locale: 'en',
  title: 'The Rainbow Plate',
  synopsis: 'test',
  mascot_name: 'Marya the Fox',
  native_review_status: 'reviewed',
  is_active: true,
  pages: [
    { order: 1, text: '{child_name} loves {organisation}.', image_prompt: '{mascot} and {child_name}' },
    { order: 2, text: '{pronoun:subject_cap} smiled at {pronoun:possessive} friend {mascot}.', image_prompt: 'smiling' },
  ],
};

describe('renderTokens', () => {
  it('substitutes simple tokens', () => {
    const out = renderTokens('{child_name} at {organisation} with {mascot}', {
      childName: 'Maya',
      pronoun: 'she',
      organisation: 'Little Explorers',
      mascot: 'Marya the Fox',
      locale: 'en',
    });
    expect(out).toBe('Maya at Little Explorers with Marya the Fox');
  });

  it.each([
    ['she', 'she', 'her', 'her'],
    ['he', 'he', 'his', 'him'],
    ['they', 'they', 'their', 'them'],
  ] as const)('resolves English pronoun forms for %s', (pronoun, subject, possessive, object) => {
    const ctx = { childName: 'X', pronoun, organisation: 'Y', mascot: 'Z', locale: 'en' as const };
    expect(renderTokens('{pronoun:subject}', ctx)).toBe(subject);
    expect(renderTokens('{pronoun:possessive}', ctx)).toBe(possessive);
    expect(renderTokens('{pronoun:object}', ctx)).toBe(object);
  });

  it('capitalizes pronoun tokens with the _cap suffix', () => {
    const ctx = { childName: 'X', pronoun: 'she' as const, organisation: 'Y', mascot: 'Z', locale: 'en' as const };
    expect(renderTokens('{pronoun:subject_cap} laughed.', ctx)).toBe('She laughed.');
  });

  it('resolves Arabic verb-slot tokens by pronoun gender', () => {
    const ctx = { childName: 'مايا', pronoun: 'she' as const, organisation: 'الحضانة', mascot: 'الثعلبة', locale: 'ar' as const };
    expect(renderTokens('{child_name} {v:felt_happy}', ctx)).toBe('مايا شعرت بالسعادة');

    const ctxHe = { ...ctx, pronoun: 'he' as const };
    expect(renderTokens('{child_name} {v:felt_happy}', ctxHe)).toBe('مايا شعر بالسعادة');
  });

  it('leaves unknown {v:...} tokens untouched rather than crashing', () => {
    const ctx = { childName: 'X', pronoun: 'they' as const, organisation: 'Y', mascot: 'Z', locale: 'ar' as const };
    expect(renderTokens('{v:not_a_real_key}', ctx)).toBe('{v:not_a_real_key}');
  });
});

describe('assertTemplateUsable', () => {
  it('allows a reviewed template', () => {
    expect(() => assertTemplateUsable(baseTemplate)).not.toThrow();
  });

  it('throws TemplateNotReviewedError for a draft Arabic template', () => {
    const draftAr: StoryThemeTemplate = { ...baseTemplate, locale: 'ar', native_review_status: 'draft' };
    expect(() => assertTemplateUsable(draftAr)).toThrow(TemplateNotReviewedError);
  });

  it('allows a reviewed Arabic template', () => {
    const reviewedAr: StoryThemeTemplate = { ...baseTemplate, locale: 'ar', native_review_status: 'reviewed' };
    expect(() => assertTemplateUsable(reviewedAr)).not.toThrow();
  });

  it('does not gate English drafts the same way (English is authored directly, not translated)', () => {
    const draftEn: StoryThemeTemplate = { ...baseTemplate, native_review_status: 'draft' };
    expect(() => assertTemplateUsable(draftEn)).not.toThrow();
  });

  it('throws if the template is inactive', () => {
    expect(() => assertTemplateUsable({ ...baseTemplate, is_active: false })).toThrow(/not active/);
  });
});

describe('renderTemplate', () => {
  it('renders pages in order with all tokens resolved', () => {
    const pages = renderTemplate(baseTemplate, {
      childName: 'Maya',
      pronoun: 'she',
      organisation: 'Little Explorers',
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.text).toBe('Maya loves Little Explorers.');
    expect(pages[1]!.text).toBe('She smiled at her friend Marya the Fox.');
  });

  it('refuses to render a draft Arabic template even if called directly', () => {
    const draftAr: StoryThemeTemplate = { ...baseTemplate, locale: 'ar', native_review_status: 'draft' };
    expect(() =>
      renderTemplate(draftAr, { childName: 'مايا', pronoun: 'she', organisation: 'الحضانة' }),
    ).toThrow(TemplateNotReviewedError);
  });
});
