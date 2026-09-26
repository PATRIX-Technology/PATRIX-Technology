import { describe, expect, it } from 'vitest';
import {
  annualSavingsPercent,
  extractCheckoutMetadata,
  mapStripeSubscriptionStatus,
  planIsAvailableForTenant,
  subscriptionFromStripe,
  type StripeSubscriptionLike,
} from '@/lib/domain/billing';

function makeSubscription(overrides: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    items: {
      data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }],
    },
    ...overrides,
  };
}

describe('mapStripeSubscriptionStatus', () => {
  it.each([
    ['trialing', 'trialing'],
    ['active', 'active'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['unpaid', 'canceled'],
    ['incomplete', 'incomplete'],
    ['incomplete_expired', 'incomplete'],
    ['paused', 'incomplete'],
  ] as const)('maps Stripe status %s to %s', (stripeStatus, expected) => {
    expect(mapStripeSubscriptionStatus(stripeStatus)).toBe(expected);
  });

  it('throws loudly on an unrecognised status rather than guessing', () => {
    // Stripe's status type has a forward-compatible string catch-all, so
    // this is a legal value at the type level — the runtime guard is what
    // actually protects us from writing an unmapped status to the DB.
    expect(() => mapStripeSubscriptionStatus('some_future_status')).toThrow(/Unhandled Stripe/);
  });
});

describe('subscriptionFromStripe', () => {
  it('maps a subscription with a string customer id', () => {
    const result = subscriptionFromStripe(makeSubscription(), 'tenant-1', 'plan-1');
    expect(result).toEqual({
      tenant_id: 'tenant-1',
      plan_id: 'plan-1',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      status: 'active',
      current_period_start: new Date(1_700_000_000 * 1000).toISOString(),
      current_period_end: new Date(1_702_592_000 * 1000).toISOString(),
      cancel_at_period_end: false,
    });
  });

  it('unwraps an expanded customer object', () => {
    const result = subscriptionFromStripe(
      makeSubscription({ customer: { id: 'cus_expanded' } }),
      'tenant-1',
    );
    expect(result.stripe_customer_id).toBe('cus_expanded');
  });

  it('omits plan_id when not supplied (renewal events do not know the plan)', () => {
    const result = subscriptionFromStripe(makeSubscription(), 'tenant-1');
    expect(result).not.toHaveProperty('plan_id');
  });

  it('sets null periods when there is no subscription item (defensive edge case)', () => {
    const result = subscriptionFromStripe(makeSubscription({ items: { data: [] } }), 'tenant-1');
    expect(result.current_period_start).toBeNull();
    expect(result.current_period_end).toBeNull();
  });

  it('reflects cancel_at_period_end', () => {
    const result = subscriptionFromStripe(makeSubscription({ cancel_at_period_end: true }), 'tenant-1');
    expect(result.cancel_at_period_end).toBe(true);
  });
});

describe('extractCheckoutMetadata', () => {
  it('extracts tenant_id and plan_id from session metadata', () => {
    const result = extractCheckoutMetadata({ metadata: { tenant_id: 't1', plan_id: 'p1' } });
    expect(result).toEqual({ tenantId: 't1', planId: 'p1' });
  });

  it('throws when tenant_id is missing', () => {
    expect(() => extractCheckoutMetadata({ metadata: { plan_id: 'p1' } })).toThrow(/metadata/);
  });

  it('throws when metadata is null', () => {
    expect(() => extractCheckoutMetadata({ metadata: null })).toThrow(/metadata/);
  });
});

describe('planIsAvailableForTenant', () => {
  it('allows a nursery tenant to buy a nursery-audience plan', () => {
    expect(planIsAvailableForTenant({ audience: 'nursery' }, 'nursery')).toBe(true);
  });

  it('allows a family tenant to buy a family-audience plan', () => {
    expect(planIsAvailableForTenant({ audience: 'family' }, 'family')).toBe(true);
  });

  it('rejects a family tenant buying a nursery-audience plan', () => {
    expect(planIsAvailableForTenant({ audience: 'nursery' }, 'family')).toBe(false);
  });

  it('rejects a nursery tenant buying a family-audience plan', () => {
    expect(planIsAvailableForTenant({ audience: 'family' }, 'nursery')).toBe(false);
  });
});

describe('annualSavingsPercent', () => {
  it('computes ~20% savings for the Starter nursery plan (499/mo vs 4790/yr)', () => {
    expect(annualSavingsPercent({ price_monthly_cents: 49900, price_annual_cents: 479000 })).toBe(20);
  });

  it('computes ~17% savings for the Family plan ($9/mo vs $90/yr — exactly 2 months free)', () => {
    expect(annualSavingsPercent({ price_monthly_cents: 900, price_annual_cents: 9000 })).toBe(17);
  });

  it('returns 0 rather than dividing by zero when monthly price is 0', () => {
    expect(annualSavingsPercent({ price_monthly_cents: 0, price_annual_cents: 0 })).toBe(0);
  });

  it('returns a negative number if annual is somehow priced higher than 12 months (bad data, not hidden)', () => {
    expect(annualSavingsPercent({ price_monthly_cents: 1000, price_annual_cents: 13000 })).toBeLessThan(0);
  });
});
