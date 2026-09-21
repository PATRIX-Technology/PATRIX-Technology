import { randomBytes, createHash } from 'node:crypto';
import { flags } from '@/lib/flags';

export interface ConsentScope {
  story: boolean;
  photo: boolean;
}

export const DEFAULT_CONSENT_SCOPE: ConsentScope = { story: true, photo: false };

/**
 * Generates a new, unguessable consent token and its stored hash. The raw
 * token goes into the link/QR code shown to the nursery; only the hash is
 * persisted (see consent_requests.token_hash), so a database leak alone
 * can never be used to forge or replay a consent decision.
 */
export function generateConsentToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashConsentToken(token) };
}

export function hashConsentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildConsentUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${token}`;
}

/**
 * The photo-personalisation gate. ALL FIVE conditions in the product spec
 * must hold before photo consent can even be requested — this function is
 * the single place that decides that, so no UI path can accidentally
 * request or record photo consent while the feature is meant to be off.
 */
export interface PhotoGateInput {
  tenantOptedIntoPhoto: boolean;
  legalReviewCompleted: boolean;
}

export function isPhotoPersonalizationAllowed(input: PhotoGateInput): boolean {
  return flags.photoPersonalization && input.tenantOptedIntoPhoto && input.legalReviewCompleted;
}

export function buildConsentScope(input: PhotoGateInput & { requestPhoto: boolean }): ConsentScope {
  const photoAllowed = input.requestPhoto && isPhotoPersonalizationAllowed(input);
  return { story: true, photo: photoAllowed };
}
