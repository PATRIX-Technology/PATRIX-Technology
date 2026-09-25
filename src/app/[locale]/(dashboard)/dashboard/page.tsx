import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';

export default async function DashboardOverviewPage() {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('dashboard.overview');
  if (!context) return null;

  const [{ count: childrenCount }, { count: pendingApprovalCount }, { count: consentPendingCount }] =
    await Promise.all([
      supabase.from('children').select('id', { count: 'exact', head: true }).eq('tenant_id', context.tenantId),
      supabase
        .from('stories')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('status', 'NEEDS_REVIEW'),
      supabase
        .from('children')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('consent_status', 'pending'),
    ]);

  // A family tenant's own consent is granted automatically at signup
  // (see docs/DECISIONS.md "Phase 4: families are tenants"), so this
  // count is always 0 for them - showing it would just be a confusing,
  // permanently-zero stat.
  const stats = [
    { label: t('childrenCount'), value: childrenCount ?? 0 },
    { label: t('pendingApproval'), value: pendingApprovalCount ?? 0 },
    ...(context.tenantType === 'nursery'
      ? [{ label: t('consentPending'), value: consentPendingCount ?? 0 }]
      : []),
  ];

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl text-ink-900">
        {t('welcome')}, {context.fullName.split(' ')[0]}
      </h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardTitle className="text-sm font-medium text-ink-500">{stat.label}</CardTitle>
            <p className="mt-2 font-display text-3xl text-ink-900">{stat.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
