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
});
