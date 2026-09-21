/**
 * The illustration prompt sent to Gemini. Deliberately asks for artwork
 * ONLY — never text baked into the image. Story text is rendered
 * separately, by our own code, with real fonts and correct Arabic
 * shaping (src/lib/providers/pdf/arabic-shaping.ts) — see
 * docs/DECISIONS.md "Gemini illustrations, our own text overlay" for why
 * this is more reliable than asking an image model to render Arabic
 * script as pixels.
 */

export const BRAND_STYLE_PROMPT =
  'Warm, premium children\'s storybook illustration, soft rounded shapes, gentle consistent ' +
  'lighting, cozy detailed background, an anime-influenced but wholesome children\'s-book art ' +
  'style, culturally appropriate for a UAE/Gulf audience. Absolutely no text, letters, words, or ' +
  'writing anywhere in the image. Portrait orientation, centred composition with room at the top ' +
  'and bottom of the frame for a text overlay to be added afterwards (do not fill the very top or ' +
  'very bottom 15% of the frame with important detail).';

export interface IllustrationPromptInput {
  sceneDescription: string;
  avatarConfig: { hair?: string; skinTone?: string; outfitColor?: string; accessory?: string };
  hasReferencePhoto: boolean;
  hasReferenceImage: boolean;
}

export function buildIllustrationPrompt(input: IllustrationPromptInput): string {
  const parts = [BRAND_STYLE_PROMPT, `Scene: ${input.sceneDescription}`];

  if (input.hasReferencePhoto) {
    parts.push(
      'A reference photo of the real child is attached — illustrate a warm, cartoon/anime-style ' +
        'character clearly inspired by their likeness (hair, skin tone, general look), NOT a photo-realistic ' +
        'rendering — this must read as a storybook illustration, not a photo edit.',
    );
  } else {
    const { hair, skinTone, outfitColor, accessory } = input.avatarConfig;
    parts.push(
      `The child character has: ${hair ?? 'curly black'} hair, ${skinTone ?? 'medium'} skin tone, ` +
        `wearing an outfit in colour ${outfitColor ?? '#20949c'}` +
        (accessory && accessory !== 'none' ? `, with a ${accessory}.` : '.'),
    );
  }

  if (input.hasReferenceImage) {
    parts.push(
      'A reference image of this same character from an earlier page in the story is attached — ' +
        'keep the character\'s face, hair, and outfit exactly consistent with that reference.',
    );
  }

  return parts.join(' ');
}
