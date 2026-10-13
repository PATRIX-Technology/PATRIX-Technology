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
 * The Founding Partner discount's Stripe coupon shape depends on billing
 * interval, not just a flat "N months off" — see docs/DECISIONS.md
 * "Founding Partner discount duration by billing interval".
 *
 * Annual: one invoice covers the whole signed-up term, so `duration:
 * 'once'` discounts that entire first invoice at the full rate, and the
 * renewal a year later is automatically full price — "locked for the term
 * you signed up for, back to standard after."
 *
 * Monthly: `duration: 'repeating'` for however many whole calendar months
 * remain between signup and the campaign's own cutoff date (not a fixed
 * count) — a nursery signing up in October gets more discounted invoices
 * than one signing up in December, but every monthly subscriber reverts to
 * standard pricing at the same calendar date rather than after a fixed
 * number of invoices. `cutoff` is the SAME date used as the coupon's own
 * `expires_at` (eligibility to redeem at all) — reused here rather than a
 * second config value, since "last day to sign up for the offer" and
 * "first month no longer discounted" are the same date by design.
 */
export function computeFoundingPartnerCouponParams(
  billingInterval: 'monthly' | 'annual',
  percentOff: number,
  now: Date,
  cutoff: Date,
): FoundingPartnerCouponParams {
  if (billingInterval === 'annual') {
    return { percent_off: percentOff, duration: 'once' };
  }
  const monthsRemaining =
    (cutoff.getFullYear() - now.getFullYear()) * 12 + (cutoff.getMonth() - now.getMonth());
  return {
    percent_off: percentOff,
    duration: 'repeating',
    // Floor at 1: validateCoupon's own expiry check is what actually keeps
    // a signup past the cutoff from reaching this function at all, but
    // Stripe itself rejects a repeating coupon with duration_in_months < 1
    // outright, so this is a defensive floor, not the real gate.
    duration_in_months: Math.max(1, monthsRemaining),
  };
}
