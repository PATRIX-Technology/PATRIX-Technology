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
  let couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim() : undefined;

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('founding_partner_discount, special_discount_percent')
    .eq('id', context.tenantId)
    .maybeSingle();

  // FOUNDING10 only ever applies to a tenant the founder has explicitly
  // flagged from /owner/subscriptions -- even if someone types the code
  // themselves, it's rejected below unless the flag is also set. This is
  // what actually keeps the "not publicly advertised" decision safe: the
  // code alone was never meant to be sufficient. See docs/DECISIONS.md
  // "Founding Partner flag replaces self-serve coupon code".
  const requestedFoundingPartnerByCode = couponCode?.toUpperCase() === 'FOUNDING10';

  // A flagged nursery gets the discount automatically -- they never need
  // to know or type the code themselves.
  if (!couponCode && tenantRow?.founding_partner_discount) {
    couponCode = 'FOUNDING10';
  }

  if ((requestedFoundingPartnerByCode || couponCode === 'FOUNDING10') && !tenantRow?.founding_partner_discount) {
    return NextResponse.json({ error: 'This coupon is not valid for your account.' }, { status: 409 });
  }

  // An ad hoc, founder-set special discount (independent of Founding
  // Partner, not capped at 10) -- only applies when no coupon code is in
  // play at all, so it never silently overrides an explicit code. See
  // docs/DECISIONS.md "Special discount percent, independent of Founding
  // Partner".
  const specialDiscountPercent = !couponCode ? tenantRow?.special_discount_percent ?? null : null;

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
  // Only set for a Founding Partner checkout happening before real launch
  // (see computeFoundingPartnerTrialEnd) -- a nursery converting during
  // the free-pilot months gets their paid term anchored to launch day
  // rather than to whatever day they happened to check out, monthly or
  // annual alike.
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
      // object, because its shape depends on billing interval (see
      // computeFoundingPartnerCouponParams) — something a single static
      // Stripe coupon object can't express. Created fresh, scoped to this
      // one checkout, every time. coupon.expires_at is also the real
      // launch date (FOUNDING_PARTNER_BILLING_START) — redeeming on or
      // after it gets no discount at all, by design — see
      // docs/DECISIONS.md "Founding Partner discount simplified to a flat
      // 12 months".
      const params = computeFoundingPartnerCouponParams(billingInterval, coupon.percent_off);
      const stripeCoupon = await stripe.coupons.create(params);
      stripeCouponId = stripeCoupon.id;
      trialEndUnix = computeFoundingPartnerTrialEnd(new Date());
    }
  } else if (specialDiscountPercent) {
    // Ad hoc, founder-set discount for this tenant specifically -- a
    // fresh one-time Stripe coupon, billed from checkout as normal (no
    // trial_end anchor; that's a Founding-Partner-specific mechanic, not
    // part of this simpler one-off override).
    const stripeCoupon = await stripe.coupons.create({ percent_off: specialDiscountPercent, duration: 'once' });
    stripeCouponId = stripeCoupon.id;
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
