import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates a new, unguessable staff invite token and its stored hash.
 * The raw token goes into the shareable link; only the hash is persisted
 * (see staff_invites.token_hash) -- same trust model as
 * src/lib/domain/consent.ts's generateConsentToken.
 */
export function generateStaffInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashStaffInviteToken(token) };
}

export function hashStaffInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildStaffInviteUrl(baseUrl: string, locale: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${locale}/staff/accept/${token}`;
}
