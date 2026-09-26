import type { Pronoun } from '@/types/database';

/**
 * Provider-agnostic abstraction for turning a rendered page (text + image
 * prompt + avatar config) into an illustration. Swapping AI vendors, or
 * falling back to the mock provider in dev/CI, means implementing this one
 * interface — no other code should import a vendor SDK directly.
 */
export interface GenerateImageRequest {
  tenantId: string;
  storyId: string;
  pageId: string;
  /** The rendered scene description for this page (tokens already
   * substituted — see src/lib/domain/templates.ts). */
  prompt: string;
  avatarConfig: Record<string, string>;
  /** The story's pronoun_snapshot — see docs/DECISIONS.md "Gender in the
   * illustration prompt". Only affects the avatar-config character
   * description (no reference photo); a real photo already carries this
   * information visually, so it's not injected as text in that branch. */
  pronoun: Pronoun;
  /**
   * This page's on-page story text and its language. For Arabic pages,
   * the provider bakes this text into the illustration itself as a
   * caption band — see buildIllustrationPrompt in ./prompts.ts for why:
   * no PDF text-drawing library correctly shapes Arabic script from this
   * project's embedded font (confirmed by rendering to an actual PDF and
   * comparing pixel-for-pixel against real shaping engines — see
   * docs/DECISIONS.md "Arabic PDF text shaping"), while Gemini's own
   * image model renders it correctly and legibly as pixels. English
   * pages are unaffected: the caller still draws English captions itself
   * (src/lib/providers/pdf/render.ts), since Latin text was never broken.
   */
  captionText: string;
  locale: 'en' | 'ar';
  /**
   * The child's uploaded reference photo, if photo personalisation is
   * enabled/consented for this story (src/lib/domain/consent.ts
   * isPhotoPersonalizationAllowed). Used so the illustrated character
   * resembles the real child. Never persisted by the provider itself —
   * the caller (job worker) is responsible for fetching it from Storage
   * and discarding it after the request.
   */
  referencePhotoBytes?: Uint8Array;
  referencePhotoContentType?: string;
  /** A previously generated page's image bytes, used so the illustrated
   * character stays visually consistent from page to page within the
   * same story (a lightweight "reference sheet" approach). */
  referenceImageBytes?: Uint8Array;
  referenceImageContentType?: string;
}

export interface GenerateImageResult {
  /** Raw image bytes. The caller (job worker) uploads these to Storage. */
  bytes: Uint8Array;
  contentType: string;
  provider: string;
  costUsd: number;
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

export class SpendCapExceededError extends Error {
  constructor(scope: 'tenant' | 'global') {
    super(`Image generation blocked: the ${scope} AI spending cap has been reached.`);
    this.name = 'SpendCapExceededError';
  }
}

export interface ImageProvider {
  readonly name: string;
  generate(request: GenerateImageRequest): Promise<GenerateImageResult>;
}
