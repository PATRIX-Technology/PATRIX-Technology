import { GoogleGenAI } from '@google/genai';

export interface ImageSafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Every real (paid, AI-generated) image must pass a safety check before it
 * is ever written to Storage or shown to a member of staff for approval —
 * this is a hard pipeline step (see RealImageProvider.generate), not an
 * optional add-on. The mock provider never needs this (its output is a
 * fixed, known-safe local placeholder), so MockImageProvider does not call
 * a checker at all.
 */
export interface ImageSafetyChecker {
  readonly name: string;
  check(bytes: Uint8Array, contentType: string): Promise<ImageSafetyResult>;
}

/**
 * Fallback used when FEATURE_REAL_IMAGE_PROVIDER is on but no real
 * moderation vendor has been configured yet. Deliberately fails CLOSED —
 * it marks every image unsafe rather than defaulting to "safe" — so
 * real image generation cannot silently ship ungated content just
 * because nobody wired up a real checker. See docs/DECISIONS.md "Image
 * safety checks fail closed".
 */
export class UnconfiguredSafetyChecker implements ImageSafetyChecker {
  readonly name = 'unconfigured';

  async check(): Promise<ImageSafetyResult> {
    return {
      safe: false,
      reason:
        'No image safety/moderation checker is configured. Set IMAGE_SAFETY_PROVIDER before enabling real image generation.',
    };
  }
}

const MODERATION_MODEL = 'gemini-3.1-flash-lite';

const MODERATION_PROMPT =
  "You are a strict content-safety reviewer for a children's storybook app used by nurseries " +
  'and schools. Review the attached illustration, generated for a young child’s personalised ' +
  'story. Reject it (safe=false) if it contains: nudity or sexual content, graphic violence or ' +
  'gore, hate symbols, realistically depicted weapons, self-harm imagery, or anything otherwise ' +
  'inappropriate for a nursery/school audience. Ordinary cartoon storybook illustrations of ' +
  'children, animals, food, classrooms, and everyday scenes are expected and safe (safe=true). ' +
  'Respond with ONLY a JSON object of the exact shape {"safe": boolean, "reason": string} — ' +
  '"reason" holds a short explanation when unsafe, or an empty string when safe.';

/**
 * Uses Gemini itself (a cheap, fast text/vision model, not the image-
 * generation one) as the moderation vendor, so no separate API/vendor
 * account is needed beyond the Gemini key already required for image
 * generation. See docs/DECISIONS.md "Image safety checks fail closed" —
 * any error or unparseable response here must resolve to unsafe, never
 * default to safe.
 */
export class VendorModerationSafetyChecker implements ImageSafetyChecker {
  readonly name = 'vendor';
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async check(bytes: Uint8Array, contentType: string): Promise<ImageSafetyResult> {
    let responseText: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: MODERATION_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { text: MODERATION_PROMPT },
              { inlineData: { mimeType: contentType, data: Buffer.from(bytes).toString('base64') } },
            ],
          },
        ],
        config: { responseMimeType: 'application/json' },
      });
      responseText = response.text;
    } catch (cause) {
      return { safe: false, reason: `Moderation request failed: ${(cause as Error).message}` };
    }

    if (!responseText) {
      return { safe: false, reason: 'Moderation model returned no response.' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return { safe: false, reason: 'Moderation response was not valid JSON.' };
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { safe?: unknown }).safe !== 'boolean'
    ) {
      return { safe: false, reason: 'Moderation response was not in the expected format.' };
    }

    const { safe, reason } = parsed as { safe: boolean; reason?: unknown };
    return { safe, reason: typeof reason === 'string' && reason ? reason : undefined };
  }
}

export function createImageSafetyChecker(apiKey?: string): ImageSafetyChecker {
  const provider = process.env.IMAGE_SAFETY_PROVIDER;
  if (provider === 'vendor' && apiKey) {
    return new VendorModerationSafetyChecker(apiKey);
  }
  return new UnconfiguredSafetyChecker();
}
