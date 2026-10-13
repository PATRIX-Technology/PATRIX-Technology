import { describe, expect, it } from 'vitest';
import {
  computeFoundingPartnerCouponParams,
  couponRejectionMessage,
  validateCoupon,
  type CouponRecord,
} from '@/lib/domain/coupons';

const baseCoupon: CouponRecord = {
  code: 'WELCOME10',
  is_active: true,
  expires_at: null,
  max_redemptions: null,
  times_redeemed: 0,
};

describe('validateCoupon', () => {
  it('accepts an active coupon with no limits', () => {
    expect(validateCoupon(baseCoupon)).toEqual({ valid: true });
  });

  it('rejects an inactive coupon', () => {
    expect(validateCoupon({ ...baseCoupon, is_active: false })).toEqual({
      valid: false,
      reason: 'inactive',
    });
  });

  it('rejects an expired coupon', () => {
    const now = new Date('2025-06-01T00:00:00Z');
    const expired = { ...baseCoupon, expires_at: '2025-01-01T00:00:00Z' };
    expect(validateCoupon(expired, now)).toEqual({ valid: false, reason: 'expired' });
  });

  it('accepts a coupon that expires in the future', () => {
    const now = new Date('2025-06-01T00:00:00Z');
    const notYetExpired = { ...baseCoupon, expires_at: '2025-12-31T00:00:00Z' };
    expect(validateCoupon(notYetExpired, now)).toEqual({ valid: true });
  });

  it('rejects a coupon once max_redemptions is reached', () => {
    const exhausted = { ...baseCoupon, max_redemptions: 10, times_redeemed: 10 };
    expect(validateCoupon(exhausted)).toEqual({ valid: false, reason: 'exhausted' });
  });

  it('accepts a coupon with redemptions remaining', () => {
    const almostExhausted = { ...baseCoupon, max_redemptions: 10, times_redeemed: 9 };
    expect(validateCoupon(almostExhausted)).toEqual({ valid: true });
  });

  it('checks expiry before exhaustion so the more specific reason is not masked incorrectly', () => {
    const now = new Date('2025-06-01T00:00:00Z');
    const bothProblems = {
      ...baseCoupon,
      expires_at: '2025-01-01T00:00:00Z',
      max_redemptions: 5,
      times_redeemed: 5,
    };
    expect(validateCoupon(bothProblems, now).reason).toBe('expired');
  });
});

describe('computeFoundingPartnerCouponParams', () => {
  const cutoff = new Date('2027-01-01T00:00:00Z');

  it('discounts the whole first invoice, once, for annual billing', () => {
    const now = new Date('2026-10-13T00:00:00Z');
    expect(computeFoundingPartnerCouponParams('annual', 50, now, cutoff)).toEqual({
      percent_off: 50,
      duration: 'once',
    });
  });

  it('annual duration stays "once" regardless of signup date within the campaign', () => {
    const now = new Date('2026-12-30T00:00:00Z');
    expect(computeFoundingPartnerCouponParams('annual', 50, now, cutoff)).toEqual({
      percent_off: 50,
      duration: 'once',
    });
  });

  it('repeats monthly for the whole calendar months remaining until cutoff', () => {
    // Oct 2026 -> Jan 2027 cutoff: Oct, Nov, Dec are discounted (3 months).
    const now = new Date('2026-10-13T00:00:00Z');
    expect(computeFoundingPartnerCouponParams('monthly', 50, now, cutoff)).toEqual({
      percent_off: 50,
      duration: 'repeating',
      duration_in_months: 3,
    });
  });

  it('signing up later in the campaign gets fewer discounted months, same cutoff', () => {
    // Dec 2026 -> Jan 2027 cutoff: only Dec is discounted (1 month).
    const now = new Date('2026-12-15T00:00:00Z');
    expect(computeFoundingPartnerCouponParams('monthly', 50, now, cutoff)).toEqual({
      percent_off: 50,
      duration: 'repeating',
      duration_in_months: 1,
    });
  });

  it('floors at 1 month rather than sending Stripe a zero/negative duration', () => {
    // Right at the cutoff month itself.
    const now = new Date('2027-01-01T00:00:00Z');
    expect(computeFoundingPartnerCouponParams('monthly', 50, now, cutoff)).toEqual({
      percent_off: 50,
      duration: 'repeating',
      duration_in_months: 1,
    });
  });

  it('day-of-month never changes the result, only calendar month does', () => {
    const earlyInMonth = new Date('2026-10-01T00:00:00Z');
    const lateInMonth = new Date('2026-10-30T00:00:00Z');
    expect(computeFoundingPartnerCouponParams('monthly', 50, earlyInMonth, cutoff)).toEqual(
      computeFoundingPartnerCouponParams('monthly', 50, lateInMonth, cutoff),
    );
  });
});

describe('couponRejectionMessage', () => {
  it('returns a distinct, human-readable message per reason', () => {
    const messages = new Set(
      (['inactive', 'expired', 'exhausted'] as const).map((reason) => couponRejectionMessage(reason)),
    );
    expect(messages.size).toBe(3);
  });
});
