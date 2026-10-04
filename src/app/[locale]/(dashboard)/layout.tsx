import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getMfaStatus } from '@/lib/domain/mfa';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { GenerationProgressBanner } from '@/components/stories/GenerationProgressBanner';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);

  if (!context) {
    redirect(`/${params.locale}/sign-in`);
  }

  // MFA is optional for regular tenant users, unlike the mandatory owner
  // gate — see docs/DECISIONS.md "Optional-but-recommended MFA for
  // regular users". Someone who never enrolled isn't forced to; someone
  // who DID enroll a TOTP factor always has to complete the step-up
  // before reaching any dashboard page, or a voluntarily-added second
  // factor would just be decorative.
  const mfaStatus = await getMfaStatus(supabase);
  if (mfaStatus.status === 'needs_challenge') {
    redirect(`/${params.locale}/mfa/challenge`);
  }

  const t = await getTranslations('dashboard.nav');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <DashboardNav
        locale={params.locale}
        tenantName={context.tenantName}
        tenantType={context.tenantType}
        fullName={context.fullName}
        role={context.role}
        labels={{
          overview: t('overview'),
          children: t('children'),
          stories: t('stories'),
          templates: t('templates'),
          staff: t('staff'),
          settings: t('settings'),
          usage: t('usage'),
          support: t('support'),
          invite: t('invite'),
          legal: t('legal'),
        }}
      />
      <main className="flex-1 bg-[rgb(var(--color-surface))] p-6 md:p-10">{children}</main>
      <GenerationProgressBanner locale={params.locale} />
    </div>
  );
}
