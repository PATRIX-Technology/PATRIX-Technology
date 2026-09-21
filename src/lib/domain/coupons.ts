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
