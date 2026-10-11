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
   * Separate, deliberately distinct flag from photoPersonalization above.
   * Despite its name, this does NOT mean a licensed lawyer reviewed photo
   * personalisation — no such review has happened. The founder explicitly
   * decided to launch the pilot without external counsel, accepting the
   * compliance risk himself based on general SaaS consent/deletion norms
   * rather than a UAE-specific legal opinion. See docs/DECISIONS.md
   * "Photo personalisation: founder-accepted risk, no counsel review" for
   * the full record, including the residual gaps that decision leaves
   * open (cross-border transfer via Supabase/Gemini, nursery-specific
   * child-data handling, unreviewed consent-checkbox wording). Kept as a
   * separate flag from photoPersonalization above so the two can still be
   * toggled independently if that ever matters again.
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
