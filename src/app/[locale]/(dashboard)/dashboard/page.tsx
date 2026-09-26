import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getSignedAssetUrl } from '@/lib/domain/storage';
import { Card, CardTitle } from '@/components/ui/Card';
import { SampleStoriesPreview } from '@/components/dashboard/SampleStoriesPreview';
import { BillingSection } from '@/components/dashboard/BillingSection';
import { flags } from '@/lib/flags';
import type { PlatformSampleStory, TenantType } from '@/types/database';

export default async function DashboardOverviewPage() {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('dashboard.overview');
  if (!context) return null;

  const firstName = context.fullName.split(' ')[0];

  if (context.tenantType === 'family') {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl text-ink-900">
          {t('welcome')}, {firstName}
        </h1>
        <SamplesAndPlans tenantId={context.tenantId} audience="family" />
      </div>
    );
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
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">
        {t('welcome')}, {firstName}
      </h1>
      <SamplesAndPlans tenantId={context.tenantId} audience="nursery" />
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
 * The sample stories + "choose a plan" block on the dashboard home tab,
 * shared by both tenant types. For a family account this is the whole
 * home tab (there is no free trial story any more — see
 * docs/DECISIONS.md "Removing the free trial story"), proving out the
 * product at zero marginal cost before asking for a subscription. For a
 * nursery it sits above that account's own operational stats, for the
 * same reason: pilot/trial nurseries see the product and its pricing
 * every time they land on their dashboard, not just once at signup.
 */
async function SamplesAndPlans({ tenantId, audience }: { tenantId: string; audience: TenantType }) {
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
    supabase.from('plans').select('*').eq('is_active', true).eq('audience', audience).order('price_monthly_cents'),
    supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  return (
    <>
      <SampleStoriesPreview samples={samples} imageUrls={imageUrls} />
      <Card>
        <CardTitle>Choose a plan</CardTitle>
        {flags.billing ? (
          <div className="mt-4">
            <BillingSection plans={plans ?? []} subscription={subscription ?? null} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">Subscriptions aren&apos;t available yet — check back soon.</p>
        )}
      </Card>
    </>
  );
}
