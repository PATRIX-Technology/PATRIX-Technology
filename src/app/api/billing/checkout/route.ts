import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getStripeClient } from '@/lib/billing/stripe';
import {
  validateCoupon,
  couponRejectionMessage,
  computeFoundingPartnerCouponParams,
  computeFoundingPartnerTrialEnd,
} from '@/lib/domain/coupons';
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const stripe = getStripeClient();

  let stripeCouponId: string | undefined;
  // Only set for an annual Founding Partner checkout happening before real
  // launch (see computeFoundingPartnerTrialEnd) -- a nursery converting
  // during the free-pilot months gets their paid 12-month term anchored to
  // launch day rather than to whatever day they happened to check out.
  let trialEndUnix: number | undefined;
  if (couponCode) {
    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode).maybeSingle();
    if (!coupon) {
      return NextResponse.json({ error: 'Coupon code not found.' }, { status: 404 });
    }
    const validation = validateCoupon(coupon);
    if (!validation.valid) {
      return NextResponse.json({ error: couponRejectionMessage(validation.reason) }, { status: 409 });
    }

    if (coupon.stripe_coupon_id) {
      // A pre-created, fixed-shape Stripe coupon — used as-is regardless
      // of billing interval.
      stripeCouponId = coupon.stripe_coupon_id;
    } else if (coupon.percent_off) {
      // A Founding Partner-style coupon: no pre-created Stripe coupon
      // object, because its actual duration depends on BOTH billing
      // interval and how much of the campaign window is left at signup
      // time (see computeFoundingPartnerCouponParams) — something a
      // single static Stripe coupon object can't express. Created fresh,
      // scoped to this one checkout, every time. coupon.expires_at doubles
      // as the campaign's own cutoff date (the same date that gates
      // whether this coupon can be redeemed at all, via validateCoupon
      // above) — see docs/DECISIONS.md "Founding Partner discount
      // duration by billing interval".
      if (!coupon.expires_at) {
        return NextResponse.json(
          { error: 'This coupon is misconfigured (missing its campaign cutoff date).' },
          { status: 500 },
        );
      }
      const params = computeFoundingPartnerCouponParams(
        billingInterval,
        coupon.percent_off,
        new Date(),
        new Date(coupon.expires_at),
      );
      const stripeCoupon = await stripe.coupons.create(params);
      stripeCouponId = stripeCoupon.id;

      if (billingInterval === 'annual') {
        trialEndUnix = computeFoundingPartnerTrialEnd(new Date());
      }
    }
  }

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
    // coupon_code (not the Stripe coupon id) rides along so the webhook can
    // increment OUR OWN coupons.times_redeemed on successful checkout —
    // see docs/DECISIONS.md "Coupon redemption count was never
    // incremented". A dynamic per-session Stripe coupon (the Founding
    // Partner path above) has no stable id to look anything up by anyway.
    metadata: { tenant_id: context.tenantId, plan_id: plan.id, ...(couponCode ? { coupon_code: couponCode } : {}) },
    subscription_data: {
      metadata: { tenant_id: context.tenantId, plan_id: plan.id },
      ...(trialEndUnix ? { trial_end: trialEndUnix } : {}),
    },
    // Billing lives on its own dashboard tab now, not inside Settings --
    // see docs/DECISIONS.md "Billing moved out of Settings into its own
    // tab". Found this pointing at the old /settings path while adding
    // USD pricing; fixed as part of the same pass.
    success_url: `${appUrl}/en/dashboard/billing?billing=success`,
    cancel_url: `${appUrl}/en/dashboard/billing?billing=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
