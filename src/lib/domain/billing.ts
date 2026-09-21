import type Stripe from 'stripe';
import type { SubscriptionStatus } from '@/types/database';

/**
 * Maps Stripe's subscription status strings onto our own enum. Kept as an
 * explicit allow-list (not a passthrough cast) so a new Stripe status we
 * haven't accounted for fails loudly instead of writing garbage into the
 * database.
 */
export function mapStripeSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'incomplete';
    default:
      // Stripe's type includes a forward-compatible `OtherString` catch-all
      // member, so this branch is reachable by the type system even though
      // every documented status is handled above — fail loudly rather than
      // silently mapping an unrecognised status to a guessed value.
      throw new Error(`Unhandled Stripe subscription status: ${String(stripeStatus)}`);
  }
}

export interface SubscriptionUpsert {
  tenant_id: string;
  plan_id?: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface StripeSubscriptionLike {
  id: string;
  customer: string | { id: string };
  status: Stripe.Subscription.Status;
  cancel_at_period_end: boolean;
  /** As of Stripe's newer API versions, billing period lives on each
   * subscription item rather than the subscription itself. We only ever
   * create single-item subscriptions (one plan per tenant), so the first
   * item's period is the subscription's period. */
  items: { data: Array<{ current_period_start: number; current_period_end: number }> };
}

/**
 * Pure mapping from a Stripe Subscription object (as delivered in
 * customer.subscription.created/updated/deleted webhooks) to the fields
 * we persist. No I/O — fully unit-testable with a hand-built fixture, and
 * exercised the same way whether the subscription came from a fresh
 * checkout or a later renewal/cancellation.
 */
export function subscriptionFromStripe(
  subscription: StripeSubscriptionLike,
  tenantId: string,
  planId?: string,
): SubscriptionUpsert {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const firstItem = subscription.items.data[0];

  return {
    tenant_id: tenantId,
    ...(planId ? { plan_id: planId } : {}),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: mapStripeSubscriptionStatus(subscription.status),
    current_period_start: firstItem ? new Date(firstItem.current_period_start * 1000).toISOString() : null,
    current_period_end: firstItem ? new Date(firstItem.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };
}

/**
 * Extracts our own tenant_id / plan_id metadata from a Checkout Session —
 * we set these explicitly when creating the session (see
 * src/app/api/billing/checkout/route.ts) specifically so the webhook
 * handler never has to guess which tenant a Stripe object belongs to.
 */
export function extractCheckoutMetadata(
  session: Pick<Stripe.Checkout.Session, 'metadata'>,
): { tenantId: string; planId: string } {
  const tenantId = session.metadata?.tenant_id;
  const planId = session.metadata?.plan_id;
  if (!tenantId || !planId) {
    throw new Error('Checkout session is missing required tenant_id/plan_id metadata.');
  }
  return { tenantId, planId };
}
