/**
 * Pricing and validation for a physical printed copy of an already
 * -generated digital storybook (see supabase/migrations/0037_print_orders.sql).
 * Prices are fixed, not computed from story length/page count — see
 * docs/DECISIONS.md "Print orders: fixed price until a vendor is
 * contracted" for why, and revisit once Logistics_Agreement.md
 * (contracts/) is actually signed with a vendor.
 */

export type PrintOrderCurrency = 'aed' | 'usd';

/** Amounts in the smallest currency unit (fils / cents), matching what
 * Stripe's price_data.unit_amount expects directly — no conversion at the
 * call site. Priced at an 80% markup on the founder-sourced AED 45/book
 * print-vendor quote (8-page run, not yet a signed contract — see
 * docs/NEEDS_FROM_ME.md): AED 45 x 1.8 = AED 81 — see docs/en/pricing.md
 * "Printed copies" for the full bulk-tier ladder and the margin math this
 * is based on. This is the standalone (1-9 copies) price; 10+ copies use
 * PRINT_ORDER_BULK_TIERS below via getPrintOrderUnitPriceMinor. */
export const PRINT_ORDER_PRICE_MINOR: Record<PrintOrderCurrency, number> = {
  usd: 2200, // $22.00
  aed: 8100, // AED 81.00
};

export interface PrintOrderBulkTier {
  minQty: number;
  /** Infinity for the open-ended top tier. */
  maxQty: number;
  priceMinor: Record<PrintOrderCurrency, number>;
  freeDelivery?: boolean;
  label: { en: string; ar: string };
}

/**
 * The bulk-tier ladder from docs/en/pricing.md "Printed copies" — kept in
 * sync with that doc by hand; update both together. USD figures aren't
 * separately documented there, so they're derived at the same AED->USD
 * ratio as the standalone price (22/81 ≈ 0.2716), rounded to the nearest
 * dollar -- the AED 69 tier's $19 matches the doc's own "earlier AED
 * 69/$19 price" reference exactly, which is a reasonable sanity check on
 * that ratio. See "Bulk print ordering, paid online" and "Automated
 * bulk-tier print-order pricing" in docs/DECISIONS.md.
 */
export const PRINT_ORDER_BULK_TIERS: PrintOrderBulkTier[] = [
  {
    minQty: 10,
    maxQty: 49,
    priceMinor: { aed: 6900, usd: 1900 },
    label: { en: 'Class-set pricing (10–49 copies)', ar: 'سعر الفصل الدراسي (١٠–٤٩ نسخة)' },
  },
  {
    minQty: 50,
    maxQty: 99,
    priceMinor: { aed: 6300, usd: 1700 },
    label: { en: 'Multi-class pricing (50–99 copies)', ar: 'سعر عدة فصول (٥٠–٩٩ نسخة)' },
  },
  {
    minQty: 100,
    maxQty: Infinity,
    priceMinor: { aed: 5800, usd: 1600 },
    freeDelivery: true,
    label: { en: 'Term-end bulk pricing + free delivery (100+ copies)', ar: 'سعر الجملة لنهاية الفصل + توصيل مجاني (١٠٠+ نسخة)' },
  },
];

/** The matching bulk tier for a given quantity, or null for 1-9 copies
 * (the standalone PRINT_ORDER_PRICE_MINOR price applies there). */
export function getPrintOrderBulkTier(quantity: number): PrintOrderBulkTier | null {
  return PRINT_ORDER_BULK_TIERS.find((tier) => quantity >= tier.minQty && quantity <= tier.maxQty) ?? null;
}

/** Flat local-delivery fee charged on top of the per-copy price for any
 * order under the 100+ free-delivery tier -- AED 30, a standard Dubai
 * local-courier express rate for a parcel this size (a few bound
 * storybooks, well under a typical 20kg local-parcel limit); see
 * docs/DECISIONS.md "Flat AED 30 delivery fee, charged for the first
 * time" for the Dubai-market figures behind that choice. USD uses the
 * same AED->USD ratio as the rest of this file (22/81 ~= 0.2716),
 * rounded to the nearest dollar. */
export const PRINT_ORDER_DELIVERY_FEE_MINOR: Record<PrintOrderCurrency, number> = {
  aed: 3000, // AED 30.00
  usd: 800, // $8.00
};

/** The delivery fee for this order size and currency -- 0 once the order
 * reaches a tier with freeDelivery (currently 100+ copies), otherwise the
 * flat PRINT_ORDER_DELIVERY_FEE_MINOR rate. Deliberately a pure function
 * of (quantity, currency), not a stored column: the checkout route, both
 * order dialogs, and the paid-order webhook notification all call this
 * directly so the fee shown to the customer, the fee Stripe actually
 * charges, and the total reported to the owner can never drift apart --
 * same reasoning as getPrintOrderUnitPriceMinor below. */
export function getPrintOrderDeliveryFeeMinor(quantity: number, currency: PrintOrderCurrency): number {
  const tier = getPrintOrderBulkTier(quantity);
  if (tier?.freeDelivery) return 0;
  return PRINT_ORDER_DELIVERY_FEE_MINOR[currency];
}

/** The actual per-copy price for this quantity and currency -- the single
 * source of truth both the checkout route and the bulk order dialog use,
 * so the price shown to the customer and the price Stripe charges can
 * never drift apart. */
export function getPrintOrderUnitPriceMinor(quantity: number, currency: PrintOrderCurrency): number {
  return getPrintOrderBulkTier(quantity)?.priceMinor[currency] ?? PRINT_ORDER_PRICE_MINOR[currency];
}

export interface NextPrintOrderTier {
  /** How many more copies to add to the current order to reach this tier. */
  copiesNeeded: number;
  tier: PrintOrderBulkTier;
}

/** The next better-priced tier above the given quantity, for an "add N
 * more copies to unlock AED X/copy" nudge in the bulk order dialog --
 * null once the order is already in the top (100+) tier, since there's
 * nothing better to unlock. */
export function getNextPrintOrderTier(quantity: number): NextPrintOrderTier | null {
  const next = PRINT_ORDER_BULK_TIERS.find((tier) => quantity < tier.minQty);
  if (!next) return null;
  return { copiesNeeded: next.minQty - quantity, tier: next };
}

export interface ShippingAddressInput {
  shippingName: string;
  shippingPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2?: string;
  shippingCity: string;
  /** ISO 3166-1 alpha-2, e.g. "AE", "US" — validated as exactly 2
   * characters at the database level too (print_orders.shipping_country
   * check constraint). */
  shippingCountry: string;
}

export interface ValidatedShippingAddress extends ShippingAddressInput {
  shippingCountry: string;
}

/** Trims and length-checks every field server-side — the dialog already
 * enforces `required` client-side, but that's a UX convenience, never the
 * actual validation boundary (the same stance taken everywhere else in
 * this codebase that accepts free-text input from a form). */
export function validateShippingAddress(input: Partial<ShippingAddressInput>): ValidatedShippingAddress | null {
  const shippingName = (input.shippingName ?? '').trim();
  const shippingPhone = (input.shippingPhone ?? '').trim();
  const shippingAddressLine1 = (input.shippingAddressLine1 ?? '').trim();
  const shippingAddressLine2 = (input.shippingAddressLine2 ?? '').trim();
  const shippingCity = (input.shippingCity ?? '').trim();
  const shippingCountry = (input.shippingCountry ?? '').trim().toUpperCase();

  if (
    shippingName.length < 1 ||
    shippingName.length > 120 ||
    shippingPhone.length < 1 ||
    shippingAddressLine1.length < 1 ||
    shippingAddressLine1.length > 200 ||
    shippingCity.length < 1 ||
    shippingCity.length > 100 ||
    !/^[A-Z]{2}$/.test(shippingCountry)
  ) {
    return null;
  }

  return {
    shippingName,
    shippingPhone,
    shippingAddressLine1,
    shippingAddressLine2: shippingAddressLine2 || undefined,
    shippingCity,
    shippingCountry,
  };
}

export function isPrintOrderCurrency(value: unknown): value is PrintOrderCurrency {
  return value === 'aed' || value === 'usd';
}

/** One Stripe Checkout session holds one line item per story in the
 * batch -- this caps that array at a sane size (well under Stripe's own
 * 100-line-item limit per session) so a single request can't be used to
 * build an absurdly large checkout. A single-story order is a batch of
 * one. */
export const MAX_BULK_PRINT_ORDER_STORIES = 50;
