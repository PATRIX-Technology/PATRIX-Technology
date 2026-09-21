import 'server-only';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Same trust model as consent tokens (src/lib/domain/consent.ts): the raw
 * code is generated once, handed to the purchaser (embedded in the
 * Stripe success_url), and only its hash is ever persisted. Split into
 * its own server-only module (separate from src/lib/domain/gifts.ts)
 * specifically because GIFT_PACKS there is imported by a client
 * component, and node:crypto cannot be bundled for the browser.
 */
export function generateGiftCode(): { code: string; codeHash: string } {
  const code = randomBytes(16).toString('base64url');
  return { code, codeHash: hashGiftCode(code) };
}

export function hashGiftCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
