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
  prompt: string;
  avatarConfig: Record<string, string>;
  /** A previously generated page's image path, used so the character stays
   * visually consistent across a story (a "reference sheet" approach). */
  referenceImagePath?: string;
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
