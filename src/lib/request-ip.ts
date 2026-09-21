import 'server-only';
import { headers } from 'next/headers';

/**
 * Best-effort client IP for rate-limiting keys. Trusts
 * X-Forwarded-For/X-Real-IP because this app is expected to run behind a
 * host (Vercel or similar) that sets these correctly and strips any
 * client-supplied value — if self-hosting behind a different proxy,
 * confirm that proxy overwrites rather than appends to these headers
 * before relying on this for anything more than rate limiting.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]!.trim();
  }
  return headerList.get('x-real-ip') ?? 'unknown';
}
