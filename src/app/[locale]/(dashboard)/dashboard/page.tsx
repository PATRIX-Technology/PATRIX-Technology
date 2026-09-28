import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { loadSampleStoryManifest } from '@/lib/domain/sample-stories';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StoryCarousel } from '@/components/marketing/StoryCarousel';
import { BillingSection } from '@/components/dashboard/BillingSection';
import { flags } from '@/lib/flags';
import type { TenantType } from '@/types/database';

export default async function DashboardOverviewPage({ params }: { params: { locale: string } }) {
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
        <Link href={`/${params.locale}/dashboard/children`}>
          <Button size="lg">{t('addChildCta')}</Button>
        </Link>
        <SamplesAndPlans tenantId={context.tenantId} audience="family" locale={params.locale} />
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
      <Link href={`/${params.locale}/dashboard/children`}>
        <Button size="lg">{t('addChildCta')}</Button>
      </Link>
      <SamplesAndPlans tenantId={context.tenantId} audience="nursery" locale={params.locale} />
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
async function SamplesAndPlans({
  tenantId,
  audience,
  locale,
}: {
  tenantId: string;
  audience: TenantType;
  locale: string;
}) {
  const supabase = await createSupabaseServerClient();
  const t = await getTranslations('stories');
  const manifest = loadSampleStoryManifest();

  const [{ data: plans }, { data: subscription }] = await Promise.all([
    supabase.from('plans').select('*').eq('is_active', true).eq('audience', audience).order('price_monthly_cents'),
    supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  // Shows only the viewer's own current-locale story, not both side by
  // side — see docs/DECISIONS.md "Real sample stories generated for the
  // landing/home page carousel".
  const sampleLocale = locale === 'ar' ? ('ar' as const) : ('en' as const);
  const samplePages = manifest?.[sampleLocale];

  return (
    <>
      <Card>
        <CardTitle>{t('samplePreviewTitle')}</CardTitle>
        {samplePages && samplePages.length > 0 ? (
          <div className="mt-4 flex justify-center">
            <StoryCarousel
              dir={sampleLocale === 'ar' ? 'rtl' : 'ltr'}
              pages={samplePages.map((page) => ({
                pageNumber: page.pageNumber,
                imageSrc: page.publicPath,
                caption: page.text,
              }))}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">{t('samplePreviewComingSoon')}</p>
        )}
      </Card>
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
