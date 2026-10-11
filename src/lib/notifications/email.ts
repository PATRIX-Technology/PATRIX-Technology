import 'server-only';
import { whatsappLink } from '@/lib/config/contact';

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

export interface PaidPrintOrderBatchItem {
  childName: string;
  storyTitle: string;
  locale: string;
}

/**
 * Notifies the founder a bulk print-order batch was just paid for, so it
 * can be forwarded to the print vendor -- see docs/DECISIONS.md "Bulk
 * print ordering, paid online, replaces the WhatsApp no-payment bypass".
 *
 * There is no WhatsApp Business API account configured (that needs a
 * Twilio WhatsApp sender or a Meta Cloud API app -- a real "need from
 * you" item, not something this can fabricate), so a server process
 * cannot push a message into WhatsApp on its own. What this *can* do
 * truthfully: send the order automatically and reliably by email (this
 * already works, same as the book-a-demo notification), with a
 * pre-filled wa.me link in the body addressed to Ownly's own number --
 * one tap from the phone this email is read on opens WhatsApp with the
 * whole order ready to forward to the printer, rather than requiring it
 * to be retyped.
 */
export async function notifyOwnerOfPaidPrintOrderBatch(params: {
  batchId: string;
  tenantName: string;
  currency: string;
  totalAmountMinor: number;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  items: PaidPrintOrderBatchItem[];
}): Promise<void> {
  const total = `${(params.totalAmountMinor / 100).toFixed(2)} ${params.currency.toUpperCase()}`;
  const itemLines = params.items.map(
    (item, i) => `  ${i + 1}. ${item.storyTitle} (for ${item.childName}, ${item.locale.toUpperCase()})`,
  );

  const summary = [
    'PAID print order — Ownly',
    `Batch: ${params.batchId}`,
    `Organisation: ${params.tenantName}`,
    `Copies: ${params.items.length}`,
    ...itemLines,
    `Total paid: ${total}`,
    `Ship to: ${params.shippingName} — ${params.shippingPhone}`,
    `Address: ${params.shippingAddress}`,
  ].join('\n');

  const forwardLink = whatsappLink(`${summary}\n\nForward this to the print vendor.`);

  await sendNotificationEmail(
    `Paid print order (${params.items.length} ${params.items.length === 1 ? 'copy' : 'copies'}) — ${params.tenantName}`,
    [summary, '', forwardLink ? `Tap to open this order in WhatsApp and forward it to the printer:\n${forwardLink}` : '']
      .filter(Boolean)
      .join('\n'),
  );
}
