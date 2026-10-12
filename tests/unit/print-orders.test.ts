import { describe, expect, it } from 'vitest';
import {
  PRINT_ORDER_DELIVERY_FEE_MINOR,
  canAdvancePrintOrderStatus,
  getPrintOrderBulkTier,
  getPrintOrderDeliveryFeeMinor,
  getPrintOrderLeadTime,
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
  it('gets longer (or stays the same) as the order gets bigger, tier by tier', () => {
    const totalDays = (qty: number) => {
      const t = getPrintOrderLeadTime(qty);
      return t.readyDays[1] + t.deliveryDays[1];
    };
    expect(totalDays(1)).toBeLessThanOrEqual(totalDays(10));
    expect(totalDays(10)).toBeLessThanOrEqual(totalDays(50));
    expect(totalDays(50)).toBeLessThanOrEqual(totalDays(100));
  });

  it('every range is a valid [min, max] with min >= 1', () => {
    for (const qty of [1, 9, 10, 49, 50, 99, 100, 500]) {
      const t = getPrintOrderLeadTime(qty);
      expect(t.readyDays[0]).toBeGreaterThanOrEqual(1);
      expect(t.readyDays[0]).toBeLessThanOrEqual(t.readyDays[1]);
      expect(t.deliveryDays[0]).toBeGreaterThanOrEqual(1);
      expect(t.deliveryDays[0]).toBeLessThanOrEqual(t.deliveryDays[1]);
    }
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
