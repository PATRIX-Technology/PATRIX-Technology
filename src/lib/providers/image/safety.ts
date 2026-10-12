import { GoogleGenAI } from '@google/genai';

export interface ImageSafetyResult {
  safe: boolean;
  reason?: string;
  /** True when `safe: false` came from an infrastructure failure (a
   * network error, or MODERATION_REQUEST_TIMEOUT_MS firing) rather than
   * the model actually completing a review and flagging the image —
   * worth retrying (the next attempt gets a fresh timeout window and may
   * well succeed) rather than treated as a genuine, permanent moderation
   * rejection. See docs/DECISIONS.md "Gemini request timeout caps
   * worker wave duration" for why an uncapped moderation call could
   * itself crash a customer's tab the exact same way an uncapped
   * image-generation call did -- capping the call alone isn't enough if
   * every timeout is then treated as non-retryable, since that would
   * turn an ordinary transient slowdown into a permanently failed story
   * instead of a job-queue retry. */
  transient?: boolean;
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

/** Same reasoning as GeminiImageProvider's GEMINI_REQUEST_TIMEOUT_MS —
 * this call sat on the exact same per-image hot path (RealImageProvider
 * .generate() calls callVendorApi() THEN safetyChecker.check(), same
 * worker job, same wave) with no cap of its own, so capping only the
 * image-generation call wasn't enough: a slow moderation call could
 * still push a wave past Vercel's platform timeout and crash whichever
 * browser's AutoRefresh triggered that kick — confirmed live, a second
 * time, on a story that only had this checker left uncapped. Shorter
 * than the image-gen cap since this model is lighter (short text+image
 * in, a few words of JSON out, not a full illustration). */
const MODERATION_REQUEST_TIMEOUT_MS = 15_000;

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
        config: {
          responseMimeType: 'application/json',
          httpOptions: { timeout: MODERATION_REQUEST_TIMEOUT_MS },
        },
      });
      responseText = response.text;
    } catch (cause) {
      return { safe: false, reason: `Moderation request failed: ${(cause as Error).message}`, transient: true };
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
