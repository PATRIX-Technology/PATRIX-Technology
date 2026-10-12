import { describe, expect, it } from 'vitest';
import {
  PRINT_ORDER_CONFIRMED_LEAD_DAYS,
  PRINT_ORDER_DELIVERY_FEE_MINOR,
  addWorkingDays,
  canAdvancePrintOrderStatus,
  getPrintOrderBulkTier,
  getPrintOrderDeliveryFeeMinor,
  getPrintOrderExpectedDeliveryDate,
  getPrintOrderUnitPriceMinor,
} from '@/lib/domain/print-orders';

describe('print order delivery fee', () => {
  it('charges the flat AED/USD fee for a standalone (1-9 copy) order', () => {
    expect(getPrintOrderDeliveryFeeMinor(1, 'aed')).toBe(PRINT_ORDER_DELIVERY_FEE_MINOR.aed);
    expect(getPrintOrderDeliveryFeeMinor(1, 'usd')).toBe(PRINT_ORDER_DELIVERY_FEE_MINOR.usd);
  });

  it('charges the flat fee at every bulk tier below the free-delivery threshold', () => {
    expect(getPrintOrderDeliveryFeeMinor(10, 'aed')).toBe(PRINT_ORDER_DELIVERY_FEE_MINOR.aed);
    expect(getPrintOrderDeliveryFeeMinor(49, 'aed')).toBe(PRINT_ORDER_DELIVERY_FEE_MINOR.aed);
    expect(getPrintOrderDeliveryFeeMinor(50, 'aed')).toBe(PRINT_ORDER_DELIVERY_FEE_MINOR.aed);
    expect(getPrintOrderDeliveryFeeMinor(99, 'aed')).toBe(PRINT_ORDER_DELIVERY_FEE_MINOR.aed);
  });

  it('waives the fee at the 100+ free-delivery tier', () => {
    expect(getPrintOrderDeliveryFeeMinor(100, 'aed')).toBe(0);
    expect(getPrintOrderDeliveryFeeMinor(250, 'usd')).toBe(0);
    expect(getPrintOrderBulkTier(100)?.freeDelivery).toBe(true);
  });

  it('never charges delivery and a copy price that together go uncharged -- the unit price stays positive at every tier', () => {
    for (const qty of [1, 9, 10, 49, 50, 99, 100, 500]) {
      expect(getPrintOrderUnitPriceMinor(qty, 'aed')).toBeGreaterThan(0);
    }
  });
});

describe('print order lead time', () => {
  it('addWorkingDays skips weekends entirely when counting forward', () => {
    // Friday -> +3 working days must skip Sat/Sun, landing on Wednesday,
    // not Monday (which a naive +3 calendar days would give).
    const friday = new Date(2026, 9, 16); // Fri 16 Oct 2026
    const result = addWorkingDays(friday, 3);
    expect(result.getDay()).toBe(3); // Wednesday
    expect(result.getDate()).toBe(21);
  });

  it('addWorkingDays from a Monday with no weekend in the way just adds calendar days', () => {
    const monday = new Date(2026, 9, 12); // Mon 12 Oct 2026
    const result = addWorkingDays(monday, PRINT_ORDER_CONFIRMED_LEAD_DAYS);
    expect(result.getDay()).toBe(4); // Thursday
    expect(result.getDate()).toBe(15);
  });

  it('getPrintOrderExpectedDeliveryDate uses the confirmed vendor lead time from the order date', () => {
    const expected = getPrintOrderExpectedDeliveryDate('2026-10-12T10:00:00.000Z');
    expect(expected.getTime()).toBeGreaterThan(new Date('2026-10-12T10:00:00.000Z').getTime());
  });
});

describe('print order status transitions', () => {
  it('lets a paid order move to printing or cancelled', () => {
    expect(canAdvancePrintOrderStatus('paid', 'printing')).toBe(true);
    expect(canAdvancePrintOrderStatus('paid', 'cancelled')).toBe(true);
  });

  it('lets a printing order move to shipped or cancelled', () => {
    expect(canAdvancePrintOrderStatus('printing', 'shipped')).toBe(true);
    expect(canAdvancePrintOrderStatus('printing', 'cancelled')).toBe(true);
  });

  it('never lets a paid order skip straight to shipped', () => {
    expect(canAdvancePrintOrderStatus('paid', 'shipped')).toBe(false);
  });

  it('never lets a terminal (shipped/cancelled) order move anywhere', () => {
    expect(canAdvancePrintOrderStatus('shipped', 'printing')).toBe(false);
    expect(canAdvancePrintOrderStatus('shipped', 'cancelled')).toBe(false);
    expect(canAdvancePrintOrderStatus('cancelled', 'printing')).toBe(false);
    expect(canAdvancePrintOrderStatus('cancelled', 'shipped')).toBe(false);
  });

  it('never lets a pending (unpaid) order be advanced directly -- only the webhook moves pending->paid', () => {
    expect(canAdvancePrintOrderStatus('pending', 'printing')).toBe(false);
    expect(canAdvancePrintOrderStatus('pending', 'paid')).toBe(false);
  });
});
