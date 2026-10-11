import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getStripeClient } from '@/lib/billing/stripe';
import { validateCoupon, couponRejectionMessage } from '@/lib/domain/coupons';
import { planIsAvailableForTenant } from '@/lib/domain/billing';
import { flags } from '@/lib/flags';

export const runtime = 'nodejs';

/**
 * Starts a Stripe Checkout session for the signed-in tenant to subscribe
 * to a plan (test mode only — see src/lib/billing/stripe.ts). Only the
 * owner may change billing. A coupon code, if supplied, is validated
 * against our own `coupons` table BEFORE Stripe is ever contacted, so an
 * expired/exhausted/inactive coupon never becomes Stripe's problem.
 */
export async function POST(request: Request) {
  if (!flags.billing) {
    return NextResponse.json({ error: 'Billing is not enabled on this deployment yet.' }, { status: 501 });
  }

  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (context.role !== 'nursery_owner') {
    return NextResponse.json({ error: 'Only the organisation owner can manage billing.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const planKey = String(body.planKey ?? '');
  const billingInterval = body.billingInterval === 'annual' ? 'annual' : 'monthly';
  const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim() : undefined;

  const { data: plan } = await supabase.from('plans').select('*').eq('key', planKey).eq('is_active', true).maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: 'Unknown plan.' }, { status: 404 });
  }
  if (!planIsAvailableForTenant(plan, context.tenantType)) {
    return NextResponse.json(
      { error: `The ${plan.name} plan isn't available for a ${context.tenantType} account.` },
      { status: 403 },
    );
  }

  const priceId = billingInterval === 'annual' ? plan.stripe_price_id_annual : plan.stripe_price_id_monthly;
  if (!priceId) {
    return NextResponse.json(
      { error: `This plan has no Stripe price configured for ${billingInterval} billing yet.` },
      { status: 409 },
    );
  }

  let stripeCouponId: string | undefined;
  if (couponCode) {
    // Every coupon this platform has (e.g. the Founding Partner "50% off
    // for 3 months") is a Stripe `duration: 'repeating', duration_in_months`
    // discount -- that only means what it says against monthly billing,
    // where "3 months" is 3 invoices. Applied to an annual subscription
    // (one invoice per 12 months), Stripe still counts in months, not
    // billing cycles: the coupon's 3-month window closes long before the
    // next annual invoice ever arrives, so it silently discounts the
    // ENTIRE first annual payment by the full percentage instead of "3
    // months' worth" -- a founding partner on annual billing would get
    // the whole first year at 50% off, not 3 months, which is a real
    // revenue gap, not a rounding quirk. Block the combination outright
    // rather than let it happen once and find out from a Stripe invoice
    // — see docs/DECISIONS.md "Founding-partner coupon blocked on annual
    // billing".
    if (billingInterval === 'annual') {
      return NextResponse.json(
        {
          error:
            'This coupon is designed for monthly billing (a fixed number of discounted months). Switch to monthly billing to use it, or ask about an annual-specific offer instead.',
        },
        { status: 409 },
      );
    }
    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode).maybeSingle();
    if (!coupon) {
      return NextResponse.json({ error: 'Coupon code not found.' }, { status: 404 });
    }
    const validation = validateCoupon(coupon);
    if (!validation.valid) {
      return NextResponse.json({ error: couponRejectionMessage(validation.reason) }, { status: 409 });
    }
    stripeCouponId = coupon.stripe_coupon_id ?? undefined;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();

  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
    ...(existingSub?.stripe_customer_id ? { customer: existingSub.stripe_customer_id } : {}),
    client_reference_id: context.tenantId,
    metadata: { tenant_id: context.tenantId, plan_id: plan.id },
    subscription_data: { metadata: { tenant_id: context.tenantId, plan_id: plan.id } },
    // Billing lives on its own dashboard tab now, not inside Settings --
    // see docs/DECISIONS.md "Billing moved out of Settings into its own
    // tab". Found this pointing at the old /settings path while adding
    // USD pricing; fixed as part of the same pass.
    success_url: `${appUrl}/en/dashboard/billing?billing=success`,
    cancel_url: `${appUrl}/en/dashboard/billing?billing=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
