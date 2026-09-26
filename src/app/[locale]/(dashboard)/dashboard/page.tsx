import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getSignedAssetUrl } from '@/lib/domain/storage';
import { Card, CardTitle } from '@/components/ui/Card';
import { FamilySampleStories } from '@/components/dashboard/FamilySampleStories';
import { BillingSection } from '@/components/dashboard/BillingSection';
import { flags } from '@/lib/flags';
import type { PlatformSampleStory } from '@/types/database';

export default async function DashboardOverviewPage() {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('dashboard.overview');
  if (!context) return null;

  if (context.tenantType === 'family') {
    return <FamilyDashboardHome fullName={context.fullName} tenantId={context.tenantId} />;
  }

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

  const stats = [
    { label: t('childrenCount'), value: childrenCount ?? 0 },
    { label: t('pendingApproval'), value: pendingApprovalCount ?? 0 },
    { label: t('consentPending'), value: consentPendingCount ?? 0 },
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

/**
 * A family account's dashboard home. No stats grid: a new family has no
 * story of their own to show (there is no free trial story any more —
 * see docs/DECISIONS.md "Removing the free trial story"), so the first
 * thing they see instead is two fixed sample stories (proving out the
 * product for free, at zero marginal cost since nothing is generated)
 * with the subscription plans directly below.
 */
async function FamilyDashboardHome({
  fullName,
  tenantId,
}: {
  fullName: string;
  tenantId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const serviceClient = createSupabaseServiceRoleClient();

  const { data: samplesData } = await supabase.rpc('get_platform_sample_stories');
  const samples = (samplesData ?? []) as PlatformSampleStory[];

  const imageUrls: Record<string, string> = {};
  await Promise.all(
    samples.map(async (sample) => {
      if (!sample.first_page_image_asset_path) return;
      // Service-role client: these sample images belong to whichever
      // tenant the founder generated them under, not the viewer's own
      // tenant, so the viewer's own RLS-scoped Storage access would
      // otherwise (correctly) refuse to sign them.
      const url = await getSignedAssetUrl(serviceClient, sample.first_page_image_asset_path);
      if (url) imageUrls[sample.story_id] = url;
    }),
  );

  const [{ data: plans }, { data: subscription }] = await Promise.all([
    supabase.from('plans').select('*').eq('is_active', true).eq('audience', 'family').order('price_monthly_cents'),
    supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">Welcome, {fullName.split(' ')[0]}</h1>
      <FamilySampleStories samples={samples} imageUrls={imageUrls} />
      <Card>
        <CardTitle>Choose a plan</CardTitle>
        {flags.billing ? (
          <div className="mt-4">
            <BillingSection plans={plans ?? []} subscription={subscription ?? null} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            Subscriptions aren&apos;t enabled on this deployment yet — see docs/NEEDS_FROM_ME.md.
          </p>
        )}
      </Card>
    </div>
  );
}
