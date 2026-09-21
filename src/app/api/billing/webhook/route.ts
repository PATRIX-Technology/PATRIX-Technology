import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient, getStripeWebhookSecret } from '@/lib/billing/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { extractCheckoutMetadata, subscriptionFromStripe } from '@/lib/domain/billing';
import { flags } from '@/lib/flags';

export const runtime = 'nodejs';

/**
 * Stripe webhook endpoint. Two guarantees this route exists to provide:
 *
 * 1. IDEMPOTENCY: Stripe retries webhook deliveries, and can deliver the
 *    same event more than once. We record every processed event id in
 *    `stripe_webhook_events` (primary key = stripe_event_id) BEFORE doing
 *    any other write; a duplicate delivery hits a primary-key conflict
 *    and is treated as an already-handled no-op rather than double
 *    -applying a subscription change. See docs/DECISIONS.md.
 * 2. AUTHENTICITY: the raw request body is verified against
 *    STRIPE_WEBHOOK_SECRET via Stripe's own signature check
 *    (`stripe.webhooks.constructEvent`) before any of its contents are
 *    trusted — this is what stops anyone who isn't Stripe from forging a
 *    "subscription activated" event.
 */
export async function POST(request: Request) {
  if (!flags.billing) {
    return NextResponse.json({ error: 'Billing is not enabled on this deployment.' }, { status: 501 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header.' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (error) {
    return NextResponse.json({ error: `Invalid signature: ${(error as Error).message}` }, { status: 400 });
  }

  const serviceClient = createSupabaseServiceRoleClient();

  const { error: idempotencyError } = await serviceClient
    .from('stripe_webhook_events')
    .insert({ stripe_event_id: event.id, event_type: event.type });

  if (idempotencyError) {
    if (idempotencyError.code === '23505') {
      // Already processed this exact event id — safe no-op.
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ error: idempotencyError.message }, { status: 500 });
  }

  try {
    await handleEvent(serviceClient, event);
  } catch (error) {
    // The event IS recorded above even on handler failure — we deliberately
    // do not want Stripe endlessly retrying an event whose data we can't
    // make sense of (e.g. missing metadata); that failure gets surfaced in
    // application logs for a human to look at instead. Handlers that hit a
    // transient error (a dropped DB connection) should throw before the
    // idempotency insert in a future revision if retry-on-transient-failure
    // becomes a requirement.
    console.error('Stripe webhook handler error', event.type, error);
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(
  serviceClient: ReturnType<typeof createSupabaseServiceRoleClient>,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { tenantId, planId } = extractCheckoutMetadata(session);
      if (!session.subscription) return;

      const stripe = getStripeClient();
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const upsert = subscriptionFromStripe(subscription, tenantId, planId);
      const { error } = await serviceClient.from('subscriptions').upsert(upsert, { onConflict: 'tenant_id' });
      if (error) throw error;
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenant_id;
      if (!tenantId) {
        throw new Error(`Subscription ${subscription.id} is missing tenant_id metadata.`);
      }

      const upsert = subscriptionFromStripe(subscription, tenantId);
      const { error } = await serviceClient.from('subscriptions').upsert(upsert, { onConflict: 'tenant_id' });
      if (error) throw error;
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;
      if (!subscriptionId) return;

      const { error } = await serviceClient
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('stripe_subscription_id', subscriptionId);
      if (error) throw error;
      break;
    }

    default:
      // Unhandled event types are expected (Stripe sends many); no-op.
      break;
  }
}
