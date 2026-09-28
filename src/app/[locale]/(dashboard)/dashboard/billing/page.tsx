import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { BillingSection } from '@/components/dashboard/BillingSection';
import { flags } from '@/lib/flags';

/** Moved out of Settings into its own dashboard tab per founder
 * feedback — see docs/DECISIONS.md "Billing moved out of Settings into
 * its own tab". Same nursery_owner-only gate Settings used ("owner" is
 * a historical name, not a claim about tenant type -- see
 * docs/DECISIONS.md "Phase 4: families are tenants" -- so this covers
 * a family account's holder too). A non-owner staff member navigating
 * here directly (the nav link is hidden from them, but a URL is still
 * a URL) is sent back to the dashboard rather than shown nothing. */
export default async function BillingPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;
  if (context.role !== 'nursery_owner') {
    redirect(`/${params.locale}/dashboard`);
  }

  const t = await getTranslations('dashboard.billing');

  const [{ data: plans }, { data: subscription }] = await Promise.all([
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .eq('audience', context.tenantType)
      .order('price_monthly_cents'),
    supabase.from('subscriptions').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">{t('pageTitle')}</h1>
      <Card>
        <CardTitle>{t('cardTitle')}</CardTitle>
        {flags.billing ? (
          <div className="mt-4">
            <BillingSection plans={plans ?? []} subscription={subscription ?? null} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">{t('notAvailable')}</p>
        )}
      </Card>
    </div>
  );
}
