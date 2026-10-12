import 'server-only';
import { whatsappLink } from '@/lib/config/contact';

/** Where every notification email goes -- currently just the founder's
 * own inbox; see docs/DECISIONS.md "Book-a-demo section". */
const NOTIFICATION_RECIPIENT = 'yousefhawwari@gmail.com';

/**
 * Sends a plain-text email via Resend's HTTP API directly (no SDK — a
 * single fetch call, so this needed no new npm dependency). Same
 * "best-effort, never blocks the caller" shape as sendTelegramMessage:
 * silently a no-op if RESEND_API_KEY isn't set yet, and swallows any
 * send failure — a notification is a nice-to-have on top of an
 * already-saved database row, never a reason to fail the action that
 * triggered it. See docs/NEEDS_FROM_ME.md for what a free Resend
 * account needs. The single-recipient `to` string also accepts a
 * comma-separated list, matching Resend's own API.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
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
        to,
        subject,
        text: body,
      }),
    });
  } catch {
    // Best-effort — see module comment above.
  }
}

/** Always goes to the founder's own inbox — see module comment above
 * NOTIFICATION_RECIPIENT. Every pre-existing call site (book-a-demo,
 * paid print orders) keeps using this; new code that needs to email
 * someone else (e.g. a customer) calls sendEmail directly. */
export async function sendNotificationEmail(subject: string, body: string): Promise<void> {
  await sendEmail(NOTIFICATION_RECIPIENT, subject, body);
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
  /** Copies subtotal + deliveryFeeMinor -- what Stripe actually charged. */
  totalAmountMinor: number;
  /** 0 once the order reached the 100+ free-delivery tier. */
  deliveryFeeMinor: number;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  items: PaidPrintOrderBatchItem[];
}): Promise<void> {
  const currencyLabel = params.currency.toUpperCase();
  const copiesSubtotal = `${((params.totalAmountMinor - params.deliveryFeeMinor) / 100).toFixed(2)} ${currencyLabel}`;
  const delivery = params.deliveryFeeMinor > 0 ? `${(params.deliveryFeeMinor / 100).toFixed(2)} ${currencyLabel}` : 'Free';
  const total = `${(params.totalAmountMinor / 100).toFixed(2)} ${currencyLabel}`;
  const itemLines = params.items.map(
    (item, i) => `  ${i + 1}. ${item.storyTitle} (for ${item.childName}, ${item.locale.toUpperCase()})`,
  );

  const summary = [
    'PAID print order — Ownly',
    `Batch: ${params.batchId}`,
    `Organisation: ${params.tenantName}`,
    `Copies: ${params.items.length}`,
    ...itemLines,
    `Copies subtotal: ${copiesSubtotal}`,
    `Delivery (UAE): ${delivery}`,
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

/** Mirrors print_order_status (migration 0037) minus 'pending'/'cancelled'
 * -- a customer is only ever notified once their order is real (paid),
 * and a cancellation gets its own distinct message below. */
export type NotifiablePrintOrderStatus = 'paid' | 'printing' | 'shipped';

const CUSTOMER_STATUS_LINE: Record<'printing' | 'shipped' | 'cancelled', string> = {
  printing: 'Your order is now being printed.',
  shipped: 'Your order has shipped and is on its way.',
  cancelled: 'Your order has been cancelled. If you were charged, you will be refunded -- contact us if you have any questions.',
};

/**
 * Notifies the customer (the staff member or family who placed the
 * order) by email when the owner moves their order to a new status in
 * the owner dashboard's Orders tab -- see docs/DECISIONS.md "Order
 * tracking: owner Orders tab + status notifications". Best-effort, same
 * no-op-without-key shape as every other function in this module: an
 * order's real status is always the database row, this is just a
 * courtesy heads-up.
 */
export async function notifyCustomerOfOrderStatusChange(params: {
  to: string;
  tenantName: string;
  batchId: string;
  status: 'printing' | 'shipped' | 'cancelled';
  items: PaidPrintOrderBatchItem[];
}): Promise<void> {
  const itemLines = params.items.map(
    (item, i) => `  ${i + 1}. ${item.storyTitle} (for ${item.childName}, ${item.locale.toUpperCase()})`,
  );
  const body = [
    CUSTOMER_STATUS_LINE[params.status],
    '',
    `Order: ${params.batchId}`,
    `Organisation: ${params.tenantName}`,
    `Copies: ${params.items.length}`,
    ...itemLines,
  ].join('\n');

  const subjectVerb = params.status === 'printing' ? 'is printing' : params.status === 'shipped' ? 'has shipped' : 'was cancelled';
  await sendEmail(params.to, `Your Ownly print order ${subjectVerb}`, body);
}

/**
 * Notifies the founder of a client-side crash a real user just hit --
 * see docs/DECISIONS.md "Client-side crashes notify the founder instead
 * of showing the user a raw error". [locale]/error.tsx and
 * global-error.tsx both POST here (via /api/report-client-error) the
 * moment their boundary catches something, so the founder finds out
 * automatically instead of needing a screenshot from whoever hit it.
 */
export async function notifyOwnerOfClientError(params: {
  message: string;
  digest?: string;
  stack?: string;
  url: string;
  locale?: string;
}): Promise<void> {
  const body = [
    `URL: ${params.url}`,
    params.locale ? `Locale: ${params.locale}` : null,
    `Message: ${params.message}`,
    params.digest ? `Digest: ${params.digest}` : null,
    params.stack ? `\nStack:\n${params.stack.slice(0, 4000)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await sendNotificationEmail(`Client-side error on Ownly: ${params.message.slice(0, 80)}`, body);
}
