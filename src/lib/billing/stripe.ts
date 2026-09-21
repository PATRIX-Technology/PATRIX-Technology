import 'server-only';
import Stripe from 'stripe';
import { flags } from '@/lib/flags';

let cachedClient: Stripe | null = null;

/**
 * Lazily constructs the Stripe client. Throws a clear, specific error
 * rather than silently no-op-ing if billing is enabled but not
 * configured — mirrors src/lib/providers/image/factory.ts's stance that a
 * feature flag turned on with missing credentials is a configuration bug,
 * not something to paper over.
 */
export function getStripeClient(): Stripe {
  if (!flags.billing) {
    throw new Error(
      'FEATURE_BILLING is off. Enable it (and set STRIPE_SECRET_KEY) before calling any billing route.',
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('FEATURE_BILLING is on but STRIPE_SECRET_KEY is not set.');
  }

  if (process.env.STRIPE_MODE !== 'test' && secretKey.startsWith('sk_live_')) {
    // Belt-and-braces: this build is not meant to ever run live payments
    // without an explicit, separate decision — see docs/DECISIONS.md
    // "Billing stays in Stripe test mode".
    throw new Error(
      'Refusing to initialise Stripe with a live secret key while STRIPE_MODE is not explicitly "live". ' +
        'This is a deliberate safety check — see docs/DECISIONS.md.',
    );
  }

  if (!cachedClient) {
    // No explicit apiVersion: let the installed Stripe SDK pin its own
    // bundled default rather than hardcoding a version string here that
    // could drift out of sync with `stripe`'s package.json over time.
    cachedClient = new Stripe(secretKey);
  }
  return cachedClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook signatures.');
  }
  return secret;
}
