'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Plan, Subscription } from '@/types/database';

export function BillingSection({
  plans,
  subscription,
}: {
  plans: Plan[];
  subscription: Subscription | null;
}) {
  const [loadingPlanKey, setLoadingPlanKey] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function subscribe(planKey: string) {
    setLoadingPlanKey(planKey);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, billingInterval: 'monthly', couponCode: couponCode || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoadingPlanKey(null);
    }
  }

  const currentPlanId = subscription?.plan_id;

  return (
    <div className="space-y-4">
      {subscription && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-600">Current status:</span>
          <Badge tone={subscription.status === 'active' ? 'success' : 'warning'}>{subscription.status}</Badge>
          {subscription.stripe_customer_id && (
            <a href="/api/billing/portal" className="text-sm font-medium text-lagoon-600 underline">
              Manage billing
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl2 border p-4 ${
              plan.id === currentPlanId ? 'border-lagoon-600 bg-lagoon-50' : 'border-[rgb(var(--color-border))]'
            }`}
          >
            <p className="font-display text-lg text-ink-900">{plan.name}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">
              {(plan.price_monthly_cents / 100).toFixed(0)} {plan.currency}
              <span className="text-sm font-normal text-ink-500">/mo</span>
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {plan.vat_inclusive ? 'VAT included' : 'VAT excluded'}
            </p>
            <p className="mt-2 text-sm text-ink-600">{plan.stories_per_month} stories/month</p>
            <Button
              className="mt-4 w-full"
              variant={plan.id === currentPlanId ? 'secondary' : 'primary'}
              isLoading={loadingPlanKey === plan.key}
              onClick={() => subscribe(plan.key)}
              disabled={plan.id === currentPlanId}
            >
              {plan.id === currentPlanId ? 'Current plan' : 'Subscribe'}
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div>
          <label htmlFor="coupon" className="mb-1.5 block text-sm font-medium text-ink-700">
            Coupon code (optional)
          </label>
          <input
            id="coupon"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-coral-600">{error}</p>}
    </div>
  );
}
