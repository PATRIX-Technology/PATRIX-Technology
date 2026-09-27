import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { InviteLinkBox } from '@/components/dashboard/InviteLinkBox';
import type { ReferralSummary } from '@/types/database';

/**
 * Dedicated page (not just a settings card) for the referral program —
 * see docs/DECISIONS.md "Referral program replaces gifting". Linked
 * from a persistent, highlighted item in DashboardNav so it's always
 * one click away, on every dashboard page, rather than buried in
 * Settings — this is a growth lever, worth surfacing prominently.
 */
export default async function InvitePage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const t = await getTranslations('referrals');
  const { data: summary } = await supabase.rpc('get_referral_summary', {
    target_tenant_id: context.tenantId,
  });
  const referralSummary = summary as ReferralSummary | null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const steps = [t('step1'), t('step2'), t('step3')];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900">{t('pageTitle')}</h1>
        <p className="mt-2 text-ink-600">{t('pageBody')}</p>
      </div>

      <Card>
        <CardTitle>{t('yourLink')}</CardTitle>
        {referralSummary?.referral_code ? (
          <div className="mt-4">
            <InviteLinkBox
              appUrl={appUrl}
              locale={params.locale}
              tenantType={context.tenantType}
              referralCode={referralSummary.referral_code}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-500">{t('loading')}</p>
        )}
      </Card>

      <Card>
        <CardTitle>{t('howItWorksTitle')}</CardTitle>
        <ol className="mt-4 flex flex-col gap-4">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-lagoon-900/50 text-sm font-semibold text-lagoon-300"
              >
                {index + 1}
              </span>
              <p className="text-sm text-ink-600">{step}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardTitle>{t('yourStats')}</CardTitle>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="font-display text-2xl text-ink-900">{referralSummary?.pending_count ?? 0}</p>
            <p className="text-xs text-ink-500">{t('pendingLabel')}</p>
          </div>
          <div>
            <p className="font-display text-2xl text-ink-900">{referralSummary?.rewarded_count ?? 0}</p>
            <p className="text-xs text-ink-500">{t('rewardedLabel')}</p>
          </div>
          <div>
            <p className="font-display text-2xl text-saffron-300">{referralSummary?.total_stories_earned ?? 0}</p>
            <p className="text-xs text-ink-500">{t('storiesEarnedLabel')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
