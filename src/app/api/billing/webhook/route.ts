import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient, getStripeWebhookSecret } from '@/lib/billing/stripe';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { extractCheckoutMetadata, subscriptionFromStripe } from '@/lib/domain/billing';
import { flags } from '@/lib/flags';
import { notifyOwnerOfPaidPrintOrderBatch } from '@/lib/notifications/email';
import { getPrintOrderDeliveryFeeMinor, type PrintOrderCurrency } from '@/lib/domain/print-orders';

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

      // A print order's Checkout session is mode: 'payment' (see
      // /api/print-orders/checkout) and carries batch_id metadata instead
      // of tenant_id/plan_id -- handle it separately before
      // extractCheckoutMetadata, which THROWS when plan_id is missing
      // (that throw is correct for a subscription session with bad
      // metadata; it would be wrong to let it fire for a session that was
      // never a subscription purchase in the first place). One checkout
      // session can cover several stories (a bulk print order) -- every
      // print_orders row sharing that batch_id gets marked paid together,
      // then the owner is notified once with the whole order, not once
      // per story. See docs/DECISIONS.md "Bulk print ordering, paid
      // online, replaces the WhatsApp no-payment bypass".
      if (session.mode === 'payment') {
        const batchId = session.metadata?.batch_id;
        if (!batchId) return;

        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

        const { data: updatedOrders, error } = await serviceClient
          .from('print_orders')
          .update({ status: 'paid', stripe_payment_intent_id: paymentIntentId ?? null })
          .eq('batch_id', batchId)
          .eq('status', 'pending')
          .select(
            'id, story_id, currency, amount_minor, shipping_name, shipping_phone, shipping_address_line1, shipping_address_line2, shipping_city, shipping_country, tenant_id, tenants(name), stories!print_orders_story_id_fkey(theme_key, locale, children!stories_child_id_fkey(first_name, arabic_first_name))',
          );
        if (error) throw error;

        // Idempotency: a retried webhook delivery for an already-paid
        // batch updates zero rows the second time (the .eq('status',
        // 'pending') above), so updatedOrders is empty and this is a
        // no-op rather than a duplicate notification.
        if (updatedOrders && updatedOrders.length > 0) {
          const first = updatedOrders[0]!;
          const tenant = first.tenants as unknown as { name: string } | null;

          const { data: templateRows } = await serviceClient
            .from('story_theme_templates')
            .select('theme_key, locale, title')
            .in(
              'theme_key',
              updatedOrders.map((o) => (o.stories as unknown as { theme_key: string }).theme_key),
            );
          const titleByThemeLocale = new Map(
            (templateRows ?? []).map((row) => [`${row.theme_key}:${row.locale}`, row.title]),
          );

          const items = updatedOrders.map((order) => {
            const story = order.stories as unknown as {
              theme_key: string;
              locale: string;
              children: { first_name: string; arabic_first_name: string | null } | null;
            };
            const childName = (story.locale === 'ar' && story.children?.arabic_first_name) || story.children?.first_name || '';
            const storyTitle =
              titleByThemeLocale.get(`${story.theme_key}:${story.locale}`) ?? story.theme_key.replace(/_/g, ' ');
            return { childName, storyTitle, locale: story.locale };
          });

          // Pure function of order size/currency, same as at checkout time
          // (see getPrintOrderDeliveryFeeMinor's own docs) -- recomputed
          // here rather than read from a stored column so this total can
          // never drift from what Stripe actually charged.
          const deliveryFeeMinor = getPrintOrderDeliveryFeeMinor(
            updatedOrders.length,
            first.currency as PrintOrderCurrency,
          );

          await notifyOwnerOfPaidPrintOrderBatch({
            batchId,
            tenantName: tenant?.name ?? 'Unknown organisation',
            currency: first.currency,
            totalAmountMinor: updatedOrders.reduce((sum, o) => sum + o.amount_minor, 0) + deliveryFeeMinor,
            deliveryFeeMinor,
            shippingName: first.shipping_name,
            shippingPhone: first.shipping_phone,
            shippingAddress: [
              first.shipping_address_line1,
              first.shipping_address_line2,
              first.shipping_city,
              first.shipping_country,
            ]
              .filter(Boolean)
              .join(', '),
            items,
          });
        }
        break;
      }

      const { tenantId, planId } = extractCheckoutMetadata(session);
      if (!session.subscription) return;

      const stripe = getStripeClient();
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const upsert = subscriptionFromStripe(subscription, tenantId, planId);
      const { error } = await serviceClient.from('subscriptions').upsert(upsert, { onConflict: 'tenant_id' });
      if (error) throw error;

      // The subscription row now reflects which plan they bought, but that
      // alone does nothing to what they can actually use — quotas is a
      // separate table, checked independently by consume_story_quota
      // before every story generation. Without this, a tenant who just
      // paid for e.g. Growth (100 stories/month) would still be capped at
      // whatever their quota already was (1, from the free trial), unable
      // to use the plan they just bought. sync_quota_to_plan (0016) gives
      // them the full allowance for a fresh period matching Stripe's own.
      const periodStart = upsert.current_period_start ?? new Date().toISOString();
      const periodEnd = upsert.current_period_end ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: quotaError } = await serviceClient.rpc('sync_quota_to_plan', {
        target_tenant_id: tenantId,
        target_plan_id: planId,
        new_period_start: periodStart,
        new_period_end: periodEnd,
      });
      if (quotaError) throw quotaError;

      // Referral reward — see docs/DECISIONS.md "Referral program
      // replaces gifting". reward_referral is a no-op unless this
      // tenant was referred and hasn't been rewarded yet, so this is
      // safe to call on every checkout (first subscription, a later
      // upgrade, or a renewal that goes through a fresh session).
      const { error: referralError } = await serviceClient.rpc('reward_referral', {
        target_tenant_id: tenantId,
        target_plan_id: planId,
      });
      if (referralError) throw referralError;
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
