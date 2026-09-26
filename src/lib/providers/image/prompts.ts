/**
 * The illustration prompt sent to Gemini. For English pages, asks for
 * artwork only — English captions are drawn afterwards by our own code
 * with the embedded Latin font (that path was never broken; Latin text
 * needs no contextual shaping). For Arabic pages, asks Gemini to bake
 * the exact caption text into the image itself as a caption band.
 *
 * This split exists because no PDF text-drawing approach this project
 * tried correctly shaped Arabic script from the embedded font — verified
 * repeatedly by rendering to an actual PDF, rasterising it, and comparing
 * pixel-for-pixel against real shaping engines (see docs/DECISIONS.md
 * "Arabic PDF text shaping" for the full history). Gemini's own image
 * model, asked directly, renders correctly joined, legible Arabic
 * typography — confirmed the same way, by generating a real image and
 * inspecting the pixels. See docs/DECISIONS.md "Arabic captions baked
 * into the illustration".
 */

export const BRAND_STYLE_PROMPT =
  'Warm, premium children\'s storybook illustration, soft rounded shapes, gentle consistent ' +
  'lighting, cozy detailed background, an anime-influenced but wholesome children\'s-book art ' +
  'style, culturally appropriate for a UAE/Gulf audience. Portrait orientation, centred composition.';

export interface IllustrationPromptInput {
  sceneDescription: string;
  avatarConfig: { hair?: string; skinTone?: string; outfitColor?: string; accessory?: string };
  /** The child's pronoun (stories.pronoun_snapshot) — only used in the
   * avatar-config character description below (no reference photo); see
   * docs/DECISIONS.md "Gender in the illustration prompt" for why this
   * has to be spelled out explicitly rather than left for Gemini to
   * infer, and why a reference photo doesn't need it (the photo already
   * carries this visually). */
  pronoun: 'she' | 'he' | 'they';
  hasReferencePhoto: boolean;
  hasReferenceImage: boolean;
  captionText: string;
  locale: 'en' | 'ar';
}

const GENDER_DESCRIPTOR: Record<'she' | 'he' | 'they', string> = {
  she: 'a girl',
  he: 'a boy',
  they: 'a child',
};

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
      `The child character is ${GENDER_DESCRIPTOR[input.pronoun]}, with: ${hair ?? 'curly black'} hair, ` +
        `${skinTone ?? 'medium'} skin tone, wearing an outfit in colour ${outfitColor ?? '#2FBFA6'}` +
        (accessory && accessory !== 'none' ? `, with a ${accessory}.` : '.'),
    );
  }

  if (input.hasReferenceImage) {
    parts.push(
      'A reference image of this same character from an earlier page in the story is attached — ' +
        'keep the character\'s face, hair, and outfit exactly consistent with that reference.',
    );
  }

  if (input.locale === 'ar') {
    parts.push(
      'Render this exact Arabic caption directly in the image yourself, as a soft pastel rounded ' +
        'banner across the bottom of the frame (covering roughly the bottom 15-20%): right-to-left, ' +
        'correctly joined Arabic calligraphy, perfectly legible, like real printed book typography. ' +
        `The caption text is: "${input.captionText}". ` +
        'Reproduce it exactly, word for word — do not paraphrase, translate, shorten, or add to it.',
    );
  } else {
    parts.push(
      'Absolutely no text, letters, words, or writing anywhere in the image — the caption is added ' +
        'separately afterwards. Leave the very top and very bottom 15% of the frame free of important ' +
        'detail for that text overlay.',
    );
  }

  return parts.join(' ');
}
