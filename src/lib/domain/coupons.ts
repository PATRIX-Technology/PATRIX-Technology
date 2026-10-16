export interface CouponRecord {
  code: string;
  is_active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  times_redeemed: number;
}

export interface CouponValidation {
  valid: boolean;
  reason?: 'inactive' | 'expired' | 'exhausted';
}

/**
 * Pure validation, no Stripe/DB I/O — the checkout route calls this BEFORE
 * ever creating a Stripe session, so an invalid coupon never reaches
 * Stripe at all (and the redemption counter below is only incremented
 * after Stripe confirms the checkout actually completed, in the webhook
 * handler — never optimistically here).
 */
export function validateCoupon(coupon: CouponRecord, now: Date = new Date()): CouponValidation {
  if (!coupon.is_active) {
    return { valid: false, reason: 'inactive' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now.getTime()) {
    return { valid: false, reason: 'expired' };
  }
  if (coupon.max_redemptions !== null && coupon.times_redeemed >= coupon.max_redemptions) {
    return { valid: false, reason: 'exhausted' };
  }
  return { valid: true };
}

export function couponRejectionMessage(reason: CouponValidation['reason']): string {
  switch (reason) {
    case 'inactive':
      return 'This coupon is not currently active.';
    case 'expired':
      return 'This coupon has expired.';
    case 'exhausted':
      return 'This coupon has already been fully redeemed.';
    default:
      return 'This coupon is not valid.';
  }
}

export interface FoundingPartnerCouponParams {
  percent_off: number;
  duration: 'once' | 'repeating';
  duration_in_months?: number;
}

/**
 * The Founding Partner discount is always a flat 12 months — Jan 2027
 * through Jan 2028 — for every eligible nursery alike, regardless of
 * which month during the pilot they actually sign up. See
 * docs/DECISIONS.md "Founding Partner discount simplified to a flat 12
 * months": every eligible subscription's billing is anchored to start on
 * FOUNDING_PARTNER_BILLING_START via computeFoundingPartnerTrialEnd (same
 * real launch date for everyone), so the discount window is fixed rather
 * than computed from "months remaining until some cutoff."
 *
 * Annual: one invoice covers the whole 12-month term, so `duration:
 * 'once'` discounts that entire first invoice, and the renewal a year
 * later is automatically full price.
 *
 * Monthly: `duration: 'repeating'` for exactly 12 months — since every
 * eligible monthly signup's first invoice lands on the same anchored
 * date (via trial_end), 12 repeating discounted invoices covers Jan 2027
 * through Jan 2028 for all of them equally; no per-signup-month math
 * needed any more.
 */
export function computeFoundingPartnerCouponParams(
  billingInterval: 'monthly' | 'annual',
  percentOff: number,
): FoundingPartnerCouponParams {
  if (billingInterval === 'annual') {
    return { percent_off: percentOff, duration: 'once' };
  }
  return { percent_off: percentOff, duration: 'repeating', duration_in_months: 12 };
}

/**
 * Real launch date — see docs/DECISIONS.md "Founding Partner discount
 * simplified to a flat 12 months". A nursery that redeems the Founding
 * Partner coupon during the free-pilot months (before this date) gets
 * their paid term anchored to start HERE, not on whatever day they
 * happened to click "Subscribe" — so every eligible nursery's discounted
 * term runs this same launch date through the same date one year later,
 * then reverts to standard pricing, regardless of how early in the pilot
 * they converted. This is also the coupon's own `expires_at` — redeeming
 * on or after this date gets no discount at all, full stop (not a
 * reduced one); see `validateCoupon`.
 */
export const FOUNDING_PARTNER_BILLING_START = new Date('2027-01-01T00:00:00Z');

/**
 * Stripe `trial_end` (Unix seconds) to anchor a Founding Partner
 * subscription's first paid invoice to FOUNDING_PARTNER_BILLING_START,
 * or `undefined` if that date has already passed (checkout happening on
 * or after real launch starts billing immediately, same as any other
 * subscription — no artificial delay needed; this case shouldn't actually
 * be reachable in practice, since the coupon itself expires at the same
 * date, but this function stays correct either way). Stripe rejects a
 * trial_end that isn't in the future, so returning undefined past the
 * anchor is the correct behaviour, not a fallback. Applies to BOTH
 * billing intervals — monthly and annual alike need the same anchored
 * start for the flat-12-months discount above to land on the right
 * dates.
 */
export function computeFoundingPartnerTrialEnd(
  now: Date,
  billingStart: Date = FOUNDING_PARTNER_BILLING_START,
): number | undefined {
  if (now.getTime() >= billingStart.getTime()) return undefined;
  return Math.floor(billingStart.getTime() / 1000);
}
