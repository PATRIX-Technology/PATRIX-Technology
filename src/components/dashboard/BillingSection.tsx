'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { annualSavingsPercent } from '@/lib/domain/billing';
import type { Plan, Subscription } from '@/types/database';

type BillingInterval = 'monthly' | 'annual';

export function BillingSection({
  plans,
  subscription,
}: {
  plans: Plan[];
  subscription: Subscription | null;
}) {
  const t = useTranslations('dashboard.billing');
  const [loadingPlanKey, setLoadingPlanKey] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  async function subscribe(planKey: string) {
    setLoadingPlanKey(planKey);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, billingInterval, couponCode: couponCode || undefined }),
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
  const intervalLabel: Record<BillingInterval, string> = { monthly: t('monthly'), annual: t('annual') };

  return (
    <div className="space-y-4">
      {subscription && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-600">{t('currentStatus')}</span>
          {/* subscription.status is a raw DB enum ('active'/'trialing'/...),
              shown as-is rather than translated -- same convention as
              every other status badge in the app (e.g. a story page's
              image_status). */}
          <Badge tone={subscription.status === 'active' ? 'success' : 'warning'}>{subscription.status}</Badge>
          {subscription.stripe_customer_id && (
            <a href="/api/billing/portal" className="text-sm font-medium text-lagoon-600 underline">
              {t('manageBilling')}
            </a>
          )}
        </div>
      )}

      <div
        className="inline-flex rounded-xl border border-[rgb(var(--color-border))] p-1"
        role="group"
        aria-label={t('intervalLabel')}
      >
        {(['monthly', 'annual'] as const).map((interval) => (
          <button
            key={interval}
            type="button"
            onClick={() => setBillingInterval(interval)}
            aria-pressed={billingInterval === interval}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              billingInterval === interval ? 'bg-lagoon-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {intervalLabel[interval]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const priceCents = billingInterval === 'annual' ? plan.price_annual_cents : plan.price_monthly_cents;
          const savings = annualSavingsPercent(plan);
          return (
            <div
              key={plan.id}
              className={`rounded-xl2 border p-4 ${
                plan.id === currentPlanId ? 'border-lagoon-600 bg-lagoon-50' : 'border-[rgb(var(--color-border))]'
              }`}
            >
              <p className="font-display text-lg text-ink-900">{plan.name}</p>
              <p className="mt-1 text-2xl font-semibold text-ink-800">
                {(priceCents / 100).toFixed(0)} {plan.currency}
                <span className="text-sm font-normal text-ink-500">
                  {billingInterval === 'annual' ? '/yr' : '/mo'}
                </span>
              </p>
              {billingInterval === 'annual' && savings > 0 && (
                <p className="mt-0.5 text-xs font-medium text-lagoon-600">{t('savePercent', { percent: savings })}</p>
              )}
              <p className="mt-1 text-xs text-ink-500">{plan.vat_inclusive ? t('vatIncluded') : t('vatExcluded')}</p>
              <p className="mt-2 text-sm text-ink-600">{t('storiesPerMonth', { count: plan.stories_per_month })}</p>
              <Button
                className="mt-4 w-full"
                variant={plan.id === currentPlanId ? 'secondary' : 'primary'}
                isLoading={loadingPlanKey === plan.key}
                onClick={() => subscribe(plan.key)}
                disabled={plan.id === currentPlanId}
              >
                {plan.id === currentPlanId ? t('currentPlan') : t('subscribe')}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <div>
          <label htmlFor="coupon" className="mb-1.5 block text-sm font-medium text-ink-700">
            {t('couponLabel')}
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
