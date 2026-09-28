import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMfaStatus } from '@/lib/domain/mfa';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OwnerTabs } from '@/components/dashboard/OwnerTabs';
import { TenantSubscriptionControl } from '@/components/dashboard/TenantSubscriptionControl';
import type { SubscriptionStatus, TenantType } from '@/types/database';

function formatPrice(cents: number, currency: string) {
  return `${(cents / 100).toFixed(0)} ${currency}`;
}

export default async function OwnerSubscriptionsPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = userData.user
    ? await supabase.from('profiles').select('is_platform_owner').eq('id', userData.user.id).maybeSingle()
    : { data: null };

  if (!userData.user || !profile?.is_platform_owner) {
    redirect(`/${params.locale}/dashboard`);
  }

  // Mandatory MFA gate — see docs/DECISIONS.md "Owner MFA is mandatory".
  // No owner-dashboard data is fetched or rendered below this check.
  const mfaGate = await getMfaStatus(supabase);
  if (mfaGate.status === 'needs_enrollment') {
    redirect(`/${params.locale}/owner/mfa-enroll`);
  }
  if (mfaGate.status === 'needs_challenge') {
    redirect(`/${params.locale}/owner/mfa-challenge`);
  }

  const [{ data: tenants }, { data: plans }, { count: newSuggestionCount }] = await Promise.all([
    supabase
      .from('tenants')
      .select(
        `id, name, tenant_type, status, created_at,
         subscriptions(plan_id, status, current_period_end, cancel_at_period_end, trial_story_used, stripe_customer_id),
         quotas(stories_included_this_period, stories_used_this_period, period_end)`,
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('plans')
      .select('id, key, name, price_monthly_cents, currency, stories_per_month, audience, is_active')
      .order('price_monthly_cents', { ascending: true }),
    supabase.from('story_template_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">Platform owner dashboard</h1>
        <Badge tone="success">Two-factor verified this session</Badge>
      </div>

      <OwnerTabs locale={params.locale} newSuggestionCount={newSuggestionCount ?? 0} />

      <Card>
        <CardTitle>Subscriptions ({(tenants ?? []).length})</CardTitle>
        <p className="mt-2 text-sm text-ink-500">
          Every tenant&apos;s plan, billing status, and usage this period. Changing the plan or status here
          takes effect immediately and resets their quota to the new plan&apos;s full allowance — the same
          thing a real Stripe checkout does, for tenants who don&apos;t have one yet.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--color-border))] text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="py-2 pe-4">Tenant</th>
                <th className="py-2 pe-4">Plan</th>
                <th className="py-2 pe-4">Usage this period</th>
                <th className="py-2 pe-4">Renews / ends</th>
                <th className="py-2 pe-4">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--color-border))]">
              {(tenants ?? []).map((tenant) => {
                const subscription = (
                  Array.isArray(tenant.subscriptions) ? tenant.subscriptions[0] : tenant.subscriptions
                ) as {
                  plan_id: string | null;
                  status: SubscriptionStatus;
                  current_period_end: string | null;
                  cancel_at_period_end: boolean;
                  trial_story_used: boolean;
                  stripe_customer_id: string | null;
                } | null;
                const quota = (Array.isArray(tenant.quotas) ? tenant.quotas[0] : tenant.quotas) as {
                  stories_included_this_period: number;
                  stories_used_this_period: number;
                  period_end: string;
                } | null;
                const planOptions = (plans ?? [])
                  .filter((p) => p.audience === (tenant.tenant_type as TenantType) && p.is_active)
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    label: `${p.name} — ${formatPrice(p.price_monthly_cents, p.currency)}/mo`,
                  }));

                return (
                  <tr key={tenant.id} className="align-top">
                    <td className="py-3 pe-4">
                      <p className="font-medium text-ink-800">{tenant.name}</p>
                      <p className="text-xs text-ink-500 capitalize">{tenant.tenant_type} account</p>
                      {subscription?.stripe_customer_id && (
                        <p className="mt-1 text-xs text-ink-400">Stripe: {subscription.stripe_customer_id}</p>
                      )}
                    </td>
                    {subscription && planOptions.length > 0 ? (
                      <TenantSubscriptionControl
                        tenantId={tenant.id}
                        planId={subscription.plan_id}
                        status={subscription.status}
                        cancelAtPeriodEnd={subscription.cancel_at_period_end}
                        storiesUsed={quota?.stories_used_this_period ?? 0}
                        storiesIncluded={quota?.stories_included_this_period ?? 0}
                        periodEnd={subscription.current_period_end}
                        planOptions={planOptions}
                      />
                    ) : (
                      <td className="py-3 pe-4 text-xs text-ink-400" colSpan={4}>
                        No matching plans
                      </td>
                    )}
                  </tr>
                );
              })}
              {(tenants ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-sm text-ink-500">
                    No tenants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
