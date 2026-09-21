import { describe, expect, it } from 'vitest';
import { couponRejectionMessage, validateCoupon, type CouponRecord } from '@/lib/domain/coupons';

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

describe('couponRejectionMessage', () => {
  it('returns a distinct, human-readable message per reason', () => {
    const messages = new Set(
      (['inactive', 'expired', 'exhausted'] as const).map((reason) => couponRejectionMessage(reason)),
    );
    expect(messages.size).toBe(3);
  });
});
