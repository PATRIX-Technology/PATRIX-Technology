import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import type { GenerateImageRequest } from './ImageProvider';
import { RealImageProvider, type RealImageProviderConfig } from './RealImageProvider';
import type { ImageSafetyChecker } from './safety';
import { createImageSafetyChecker } from './safety';
import { buildIllustrationPrompt } from './prompts';

// gemini-2.5-flash-image ("nano banana") is deprecated and shuts down
// 2026-10-02 — this is its announced successor. Confirm against
// https://ai.google.dev/gemini-api/docs/pricing before relying on this
// in production; model names and pricing are Google's to change.
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

/**
 * Hard cap on a single Gemini call's wall-clock time. Without this, a
 * slow/congested call has no ceiling of its own (confirmed live: several
 * of one real story's page jobs sat stuck in RUNNING for ~6 minutes after
 * the worker invocation processing them was killed mid-request by
 * Vercel's platform timeout, not by any error this codebase threw) --
 * the killed function's truncated response is what crashed the browser
 * of whichever user's AutoRefresh happened to trigger that kick, even
 * though the slow job usually belongs to a different story than the one
 * they have open. See runWorkerOnce's own docstring in
 * src/lib/jobs/worker.ts and docs/DECISIONS.md "Gemini request timeout
 * caps worker wave duration" for the full chain. A timeout here throws
 * (caught by RealImageProvider.generate(), wrapped as a retryable
 * ImageGenerationError, then requeued with backoff by worker.ts) instead
 * of hanging -- exactly the same resilience path as any other Gemini
 * failure, just with an upper bound that actually exists.
 */
const GEMINI_REQUEST_TIMEOUT_MS = 25_000;

/**
 * The chosen real vendor: Google Gemini's native image generation model
 * ("nano banana"). Extends RealImageProvider so the spend-cap check,
 * spend recording, and safety-check pipeline in the base class — the
 * parts that must never be weakened — apply exactly the same way
 * regardless of vendor; this subclass only implements the actual HTTP
 * call. See docs/DECISIONS.md "Gemini is the chosen real image vendor".
 */
export class GeminiImageProvider extends RealImageProvider {
  private readonly client: GoogleGenAI;

  constructor(
    supabase: SupabaseClient,
    config: RealImageProviderConfig,
    safetyChecker: ImageSafetyChecker = createImageSafetyChecker(config.apiKey),
  ) {
    super(supabase, config, safetyChecker);
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  protected override async callVendorApi(
    request: GenerateImageRequest,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const prompt = buildIllustrationPrompt({
      sceneDescription: request.prompt,
      avatarConfig: request.avatarConfig,
      pronoun: request.pronoun,
      hasReferencePhoto: Boolean(request.referencePhotoBytes),
      hasReferenceImage: Boolean(request.referenceImageBytes),
      captionText: request.captionText,
      locale: request.locale,
      bilingual: request.bilingual,
    });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];

    if (request.referencePhotoBytes) {
      parts.push({
        inlineData: {
          mimeType: request.referencePhotoContentType ?? 'image/jpeg',
          data: Buffer.from(request.referencePhotoBytes).toString('base64'),
        },
      });
    }
    if (request.referenceImageBytes) {
      parts.push({
        inlineData: {
          mimeType: request.referenceImageContentType ?? 'image/png',
          data: Buffer.from(request.referenceImageBytes).toString('base64'),
        },
      });
    }

    const response = await this.client.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: parts,
      // Gemini defaults to 1K (~1MP) if unset — too soft for a full-screen
      // tablet reader. 2K is the sweet spot: noticeably sharper, and only
      // ~$0.034/image more — GEMINI_COST_PER_IMAGE_USD must be kept in
      // sync with this (currently 0.101, the 2K rate) or spend tracking
      // will silently undercharge.
      config: {
        imageConfig: { imageSize: '2K' },
        httpOptions: { timeout: GEMINI_REQUEST_TIMEOUT_MS },
      },
    });

    // response.data is a convenience getter that concatenates every
    // inline-data part's bytes but drops the mime type — and Gemini's
    // image models return JPEG, not PNG, so hardcoding a content type
    // here previously made every PDF/ZIP export fail with "The input is
    // not a PNG file!". Read the real mime type from the part itself.
    const imagePart = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
    const inlineData = imagePart?.inlineData;
    if (!inlineData?.data) {
      const blockReason = response.promptFeedback?.blockReason;
      throw new Error(
        blockReason
          ? `Gemini blocked the request: ${blockReason}`
          : 'Gemini returned no image data for this request.',
      );
    }

    return {
      bytes: new Uint8Array(Buffer.from(inlineData.data, 'base64')),
      contentType: inlineData.mimeType ?? 'image/jpeg',
    };
  }
}
