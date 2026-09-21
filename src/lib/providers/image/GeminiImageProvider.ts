import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import type { GenerateImageRequest } from './ImageProvider';
import { RealImageProvider, type RealImageProviderConfig } from './RealImageProvider';
import type { ImageSafetyChecker } from './safety';
import { createImageSafetyChecker } from './safety';
import { buildIllustrationPrompt } from './prompts';

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

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
    safetyChecker: ImageSafetyChecker = createImageSafetyChecker(),
  ) {
    super(supabase, config, safetyChecker);
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  protected override async callVendorApi(request: GenerateImageRequest): Promise<Uint8Array> {
    const prompt = buildIllustrationPrompt({
      sceneDescription: request.prompt,
      avatarConfig: request.avatarConfig,
      hasReferencePhoto: Boolean(request.referencePhotoBytes),
      hasReferenceImage: Boolean(request.referenceImageBytes),
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
    });

    const imageBase64 = response.data;
    if (!imageBase64) {
      const blockReason = response.promptFeedback?.blockReason;
      throw new Error(
        blockReason
          ? `Gemini blocked the request: ${blockReason}`
          : 'Gemini returned no image data for this request.',
      );
    }

    return new Uint8Array(Buffer.from(imageBase64, 'base64'));
  }
}
