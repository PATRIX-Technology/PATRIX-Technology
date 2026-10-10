/**
 * Pricing and validation for a physical printed copy of an already
 * -generated digital storybook (see supabase/migrations/0037_print_orders.sql).
 * This is the STANDALONE single-copy price only — a nursery ordering in
 * bulk (10+) goes through the WhatsApp flow (Phase F) instead, where a
 * human applies the bulk-tier price from docs/en/pricing.md "Printed
 * copies" by hand; there is no automated bulk-checkout path yet. Prices
 * are fixed, not computed from story length/page count — see
 * docs/DECISIONS.md "Print orders: fixed price until a vendor is
 * contracted" for why, and revisit once Logistics_Agreement.md
 * (contracts/) is actually signed with a vendor.
 */

export type PrintOrderCurrency = 'aed' | 'usd';

/** Amounts in the smallest currency unit (fils / cents), matching what
 * Stripe's price_data.unit_amount expects directly — no conversion at the
 * call site. Set against a founder-sourced print-vendor quote of AED
 * 45/book (8-page run, not yet a signed contract — see
 * docs/NEEDS_FROM_ME.md) plus card-processing fees, leaving roughly
 * AED 22/book (~32%) margin — see docs/en/pricing.md "Printed copies"
 * for the full bulk-tier ladder and the margin math this is based on. */
export const PRINT_ORDER_PRICE_MINOR: Record<PrintOrderCurrency, number> = {
  usd: 1900, // $19.00
  aed: 6900, // AED 69.00
};

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
