'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit, RateLimitExceededError } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { sendNotificationEmail } from '@/lib/notifications/email';
import type { ActionResult } from './auth';

/** A public, unauthenticated form on the landing page — tighter than
 * the auth actions' rate limits, since there's no account to lock out
 * and no legitimate reason for one visitor to submit this repeatedly. */
const DEMO_REQUEST_RATE_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

/**
 * "Book a demo" form on the landing page and dashboard home tab —
 * identical for organisation and family visitors, since neither this
 * form nor its notification differs by account type. Always writes a
 * durable row to demo_requests first (an insert-only RLS policy open to
 * anon/authenticated — see migration 0028 for why that's the right
 * tool here, not the service role), then best-effort emails the
 * founder via sendNotificationEmail — the email can silently fail (no
 * RESEND_API_KEY yet, a Resend outage) without losing the submission
 * or telling the visitor anything went wrong. See docs/DECISIONS.md
 * "Book-a-demo section".
 */
export async function submitDemoRequestAction(locale: string, formData: FormData): Promise<ActionResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`demo-request:${ip}`, DEMO_REQUEST_RATE_LIMIT.limit, DEMO_REQUEST_RATE_LIMIT.windowMs);
  } catch (error) {
    if (error instanceof RateLimitExceededError) return { error: error.message };
    throw error;
  }

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const organisationName = String(formData.get('organisationName') ?? '').trim();
  const message = String(formData.get('message') ?? '').trim();

  if (!name || !email) {
    return { error: 'Please share at least your name and email.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error: insertError } = await supabase.from('demo_requests').insert({
    name,
    email,
    phone: phone || null,
    organisation_name: organisationName || null,
    message: message || null,
    locale,
  });
  if (insertError) {
    return { error: 'Something went wrong sending your request — please try again.' };
  }

  await sendNotificationEmail(
    `New demo request: ${name}`,
    [
      `Name: ${name}`,
      `Email: ${email}`,
      phone && `Phone: ${phone}`,
      organisationName && `Organisation: ${organisationName}`,
      message && `Message: ${message}`,
      `Locale: ${locale}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return { message: "Thanks! We'll be in touch shortly." };
}
