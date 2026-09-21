import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

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
        }}
      />
      <main className="flex-1 bg-[rgb(var(--color-surface))] p-6 md:p-10">{children}</main>
    </div>
  );
}
