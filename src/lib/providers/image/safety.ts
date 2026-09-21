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

/**
 * NOT IMPLEMENTED — placeholder for a real moderation vendor call (many
 * image-generation vendors offer one directly; a dedicated moderation API
 * is another option). Choosing and wiring this is a founder decision, see
 * docs/NEEDS_FROM_ME.md.
 */
export class VendorModerationSafetyChecker implements ImageSafetyChecker {
  readonly name = 'vendor';

  async check(_bytes: Uint8Array, _contentType: string): Promise<ImageSafetyResult> {
    throw new Error(
      'VendorModerationSafetyChecker is not implemented. Choose a moderation vendor and implement ' +
        'this before enabling FEATURE_REAL_IMAGE_PROVIDER in production. See docs/NEEDS_FROM_ME.md.',
    );
  }
}

export function createImageSafetyChecker(): ImageSafetyChecker {
  const provider = process.env.IMAGE_SAFETY_PROVIDER;
  if (provider === 'vendor') {
    return new VendorModerationSafetyChecker();
  }
  return new UnconfiguredSafetyChecker();
}
