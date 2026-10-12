import { describe, expect, it } from 'vitest';
import {
  PRINT_ORDER_DELIVERY_FEE_MINOR,
  getPrintOrderBulkTier,
  getPrintOrderDeliveryFeeMinor,
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
