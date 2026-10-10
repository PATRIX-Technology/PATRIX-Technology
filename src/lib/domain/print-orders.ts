/**
 * Pricing and validation for a physical printed copy of an already
 * -generated digital storybook (see supabase/migrations/0037_print_orders.sql).
 * Prices are fixed, not computed from story length/page count — a single
 * flat price per currency keeps this launchable without a real print
 * -vendor cost quote yet; see docs/DECISIONS.md "Print orders: fixed price
 * until a vendor is contracted" for why, and revisit once
 * Logistics_Agreement.md (contracts/) is actually signed with a vendor.
 */

export type PrintOrderCurrency = 'aed' | 'usd';

/** Amounts in the smallest currency unit (fils / cents), matching what
 * Stripe's price_data.unit_amount expects directly — no conversion at the
 * call site. AED figure chosen against the USD figure using the official
 * USD/AED peg (3.6725), rounded to a clean retail price, same convention
 * used for the subscription plans' AED pricing (see docs/en/pricing.md). */
export const PRINT_ORDER_PRICE_MINOR: Record<PrintOrderCurrency, number> = {
  usd: 2900, // $29.00
  aed: 10900, // AED 109.00
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
