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

/** Founder directive: the nursery/organisation's or family's real name must
 * never appear inside a generated image, as a name, sign, or logo of any
 * kind. Nothing currently feeds that name into a prompt (see
 * docs/DECISIONS.md "Organisation/family name must never reach a generated
 * image" — template captions that used to reference it were rewritten to a
 * generic "nursery"/"الحضانة"), but this stays as an explicit, unconditional
 * instruction to Gemini itself, appended to every prompt regardless of
 * locale, so it holds even if a future template or scene description ever
 * reintroduces one. */
const NO_ORGANISATION_NAME_INSTRUCTION =
  'Under no circumstances render the nursery\'s, school\'s, organisation\'s, or family\'s real ' +
  'name anywhere in the image — not as text, not on a sign, book cover, uniform, or logo. If a ' +
  'name like that appears anywhere in this prompt or the caption text below, treat it as ' +
  'forbidden and omit it entirely; it must never appear as pixels in the image.';

export interface IllustrationPromptInput {
  sceneDescription: string;
  avatarConfig: { hair?: string; skinTone?: string; outfitColor?: string; accessory?: string };
  /** The child's pronoun (stories.pronoun_snapshot) — only used in the
   * avatar-config character description below (no reference photo); see
   * docs/DECISIONS.md "Gender in the illustration prompt" for why this
   * has to be spelled out explicitly rather than left for Gemini to
   * infer, and why a reference photo doesn't need it (the photo already
   * carries this visually). */
  pronoun: 'she' | 'he';
  hasReferencePhoto: boolean;
  hasReferenceImage: boolean;
  captionText: string;
  locale: 'en' | 'ar';
}

const GENDER_DESCRIPTOR: Record<'she' | 'he', string> = {
  she: 'a girl',
  he: 'a boy',
};

export function buildIllustrationPrompt(input: IllustrationPromptInput): string {
  const parts = [BRAND_STYLE_PROMPT, NO_ORGANISATION_NAME_INSTRUCTION, `Scene: ${input.sceneDescription}`];

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
        'Reproduce it exactly, word for word, in plain undiacritized script exactly as given — do ' +
        'NOT add tashkeel or harakat (fatha, damma, kasra, shadda, tanwin, or any vowel marks), and ' +
        'do not paraphrase, translate, shorten, or add to it. Do not render any other text, letters, ' +
        'words, numbers, logos, or writing anywhere else in the image — no signs, labels, book covers, ' +
        'clothing text, or watermarks — only this one caption band.',
    );
  } else {
    parts.push(
      'Absolutely no text, letters, words, numbers, logos, or writing anywhere in the image — no ' +
        'signs, labels, book covers, clothing text, or watermarks. The caption is added separately ' +
        'afterwards; the illustration itself must be text-free. Leave the very top and very bottom ' +
        '15% of the frame free of important detail for that text overlay.',
    );
  }

  return parts.join(' ');
}
