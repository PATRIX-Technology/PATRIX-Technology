import { NextResponse } from 'next/server';
import { notifyOwnerOfClientError } from '@/lib/notifications/email';
import { getRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Receives a crash report from [locale]/error.tsx or global-error.tsx the
 * moment either boundary catches something, and emails the founder --
 * see docs/DECISIONS.md "Client-side crashes notify the founder instead
 * of showing the user a raw error". Deliberately open to signed-out
 * callers too (a crash on the sign-in page itself still needs reporting).
 *
 * Every step here is best-effort and wrapped so this route always
 * returns 200: it's called from inside an error boundary, so a failure
 * here must never throw again and compound the user's original error.
 *
 * Rate-limited globally (not per-user -- there's no reliable identity for
 * a signed-out crash) so a crash loop can't flood the founder's inbox;
 * one real bug still gets through immediately, repeats within the window
 * are silently dropped rather than queued.
 */
export async function POST(request: Request) {
  try {
    const { allowed } = await getRateLimiter().check('report-client-error', 20, 10 * 60 * 1000);
    if (!allowed) return NextResponse.json({ ok: true });

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : 'Unknown error';
    const digest = typeof body.digest === 'string' ? body.digest.slice(0, 200) : undefined;
    const stack = typeof body.stack === 'string' ? body.stack.slice(0, 8000) : undefined;
    const url = typeof body.url === 'string' ? body.url.slice(0, 500) : 'unknown';
    const locale = typeof body.locale === 'string' ? body.locale.slice(0, 10) : undefined;

    await notifyOwnerOfClientError({ message, digest, stack, url, locale });
  } catch {
    // Best-effort -- see module comment above.
  }

  return NextResponse.json({ ok: true });
}
