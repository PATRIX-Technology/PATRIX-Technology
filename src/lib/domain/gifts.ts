export interface GiftPack {
  key: string;
  storyCredits: number;
  priceUsd: number;
  label: string;
}

/**
 * Fixed gift packs (Phase 4 scaffolding — no live Stripe price IDs exist
 * yet, so priceUsd here is used to create an ad-hoc Stripe Checkout line
 * item via price_data rather than a pre-created Stripe Price object; see
 * src/app/api/gifts/checkout/route.ts).
 */
export const GIFT_PACKS: readonly GiftPack[] = [
  { key: 'single', storyCredits: 1, priceUsd: 15, label: '1 story' },
  { key: 'triple', storyCredits: 3, priceUsd: 39, label: '3 stories' },
  { key: 'family', storyCredits: 6, priceUsd: 69, label: '6 stories' },
];

export function findGiftPack(key: string): GiftPack | undefined {
  return GIFT_PACKS.find((pack) => pack.key === key);
}

/** Formats a code for display as groups of 4, e.g. "ABCD-EFGH-IJKL" — easier
 * to read aloud or copy correctly than one long unbroken string. */
export function formatGiftCodeForDisplay(code: string): string {
  const clean = code.replace(/[^a-zA-Z0-9]/g, '');
  return clean.match(/.{1,4}/g)?.join('-') ?? clean;
}
