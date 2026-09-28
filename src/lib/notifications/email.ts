import 'server-only';

/** Where every notification email goes -- currently just the founder's
 * own inbox; see docs/DECISIONS.md "Book-a-demo section". */
const NOTIFICATION_RECIPIENT = 'yousefhawwari@gmail.com';

/**
 * Sends a plain-text notification email via Resend's HTTP API directly
 * (no SDK — a single fetch call, so this needed no new npm dependency).
 * Same "best-effort, never blocks the caller" shape as
 * sendTelegramMessage: silently a no-op if RESEND_API_KEY isn't set
 * yet, and swallows any send failure — a notification is a nice-to-have
 * on top of an already-saved database row (demo_requests), never a
 * reason to fail the form submission that triggered it. See
 * docs/NEEDS_FROM_ME.md for what a free Resend account needs.
 */
export async function sendNotificationEmail(subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Resend's own shared sending domain -- works with zero setup
        // on a free account, no custom domain verification needed.
        from: 'Ownly <onboarding@resend.dev>',
        to: NOTIFICATION_RECIPIENT,
        subject,
        text: body,
      }),
    });
  } catch {
    // Best-effort — see module comment above.
  }
}
