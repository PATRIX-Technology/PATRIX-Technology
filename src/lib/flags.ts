/**
 * Feature flags. All default to the safest / off setting. These gate
 * functionality that has cost, legal, or privacy implications (see
 * docs/DECISIONS.md for the reasoning behind each default).
 */

function boolFlag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'on' || value.toLowerCase() === 'true';
}

export const flags = {
  /**
   * Photo-based personalisation (uploading a real photo of a child).
   * Must stay OFF until: tenant opt-in + consent scope covering photo use +
   * this flag + legal review are ALL true. See lib/domain/consent.ts for the
   * runtime gate that enforces this even if the flag is somehow flipped on.
   */
  photoPersonalization: boolFlag(process.env.FEATURE_PHOTO_PERSONALIZATION, false),

  /**
   * Separate, deliberately distinct flag from photoPersonalization above:
   * confirms a qualified legal review of photo-based personalisation has
   * actually been completed (see docs/NEEDS_FROM_ME.md item 4a-equivalent
   * for photos). Two flags rather than one so "I turned on the feature
   * flag to test it" can never be mistaken for "legal review is done" —
   * both must independently be true.
   */
  photoPersonalizationLegalReviewComplete: boolFlag(
    process.env.PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE,
    false,
  ),

  /**
   * Real (paid) AI image generation. OFF by default — MockImageProvider is
   * used until this is explicitly enabled AND spend caps are configured.
   */
  realImageProvider: boolFlag(process.env.FEATURE_REAL_IMAGE_PROVIDER, false),

  /** Stripe billing UI and enforcement. */
  billing: boolFlag(process.env.FEATURE_BILLING, false),
} as const;

export type FeatureFlags = typeof flags;
