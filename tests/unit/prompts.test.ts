import { describe, expect, it } from 'vitest';
import { buildIllustrationPrompt, type IllustrationPromptInput } from '@/lib/providers/image/prompts';

const baseInput: IllustrationPromptInput = {
  sceneDescription: 'a fox in a garden',
  avatarConfig: { hair: 'curly black', skinTone: 'medium', outfitColor: '#2FBFA6' },
  pronoun: 'they',
  hasReferencePhoto: false,
  hasReferenceImage: false,
  captionText: 'The fox hid behind the garden gate.',
  locale: 'en',
};

describe('buildIllustrationPrompt', () => {
  it('describes the character as a girl when pronoun is she', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, pronoun: 'she' });
    expect(prompt).toContain('The child character is a girl');
  });

  it('describes the character as a boy when pronoun is he', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, pronoun: 'he' });
    expect(prompt).toContain('The child character is a boy');
  });

  it('describes the character as gender-neutral when pronoun is they', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, pronoun: 'they' });
    expect(prompt).toContain('The child character is a child');
  });

  it('does not inject a gender descriptor when a reference photo is present', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, pronoun: 'she', hasReferencePhoto: true });
    expect(prompt).not.toContain('The child character is');
    expect(prompt).toContain('reference photo of the real child');
  });

  it('tells Gemini not to add tashkeel/diacritics to the Arabic caption', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, locale: 'ar', captionText: 'الثعلب في الحديقة' });
    expect(prompt).toMatch(/tashkeel|harakat/i);
    expect(prompt).toMatch(/do NOT add/i);
  });

  it('forbids stray text (signs, labels, logos) beyond the one caption in Arabic pages', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, locale: 'ar', captionText: 'الثعلب في الحديقة' });
    expect(prompt).toMatch(/any other text/i);
  });

  it('forbids any incidental text on English pages, not just a caption', () => {
    const prompt = buildIllustrationPrompt({ ...baseInput, locale: 'en' });
    expect(prompt).toMatch(/no signs, labels, book covers, clothing text, or watermarks/i);
  });

  it('tells Gemini to never render the nursery/organisation/family name, in either locale', () => {
    const enPrompt = buildIllustrationPrompt({ ...baseInput, locale: 'en' });
    const arPrompt = buildIllustrationPrompt({ ...baseInput, locale: 'ar', captionText: 'الثعلب في الحديقة' });
    expect(enPrompt).toMatch(/nursery|organisation|family.*name/i);
    expect(arPrompt).toMatch(/nursery|organisation|family.*name/i);
  });
});
