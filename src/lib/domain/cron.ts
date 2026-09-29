import { timingSafeEqual } from 'node:crypto';

/**
 * Checks the cron worker route's Authorization header against
 * CRON_SECRET using a constant-time comparison — a plain `!==` string
 * comparison leaks how many leading bytes matched via response timing,
 * which is exactly what a secret comparison must not do. `timingSafeEqual`
 * throws on a length mismatch rather than comparing, so that case is
 * checked (and rejected) explicitly first.
 */
export function isCronRequestAuthorized(authHeader: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader ?? '');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
