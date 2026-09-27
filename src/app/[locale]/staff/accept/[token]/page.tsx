import { getTranslations } from 'next-intl/server';
import { getStaffInviteInfo } from '@/lib/actions/staff-invites-public';
import { Card } from '@/components/ui/Card';
import { AcceptStaffInviteForm } from '@/components/staff/AcceptStaffInviteForm';

export default async function StaffAcceptInvitePage({
  params,
}: {
  params: { locale: string; token: string };
}) {
  const t = await getTranslations('staffAccept');
  const info = await getStaffInviteInfo(params.token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md">
        {!info.found ? (
          <p className="text-ink-600">{t('invalidOrExpired')}</p>
        ) : info.status !== 'pending' ? (
          <p className="text-ink-600">{t('alreadyUsed')}</p>
        ) : (
          <>
            <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
            <p className="mb-6 text-sm text-ink-600">
              {t('body', {
                tenantName: info.tenantName ?? '',
                role: t(`roles.${info.role}`),
              })}
            </p>
            <AcceptStaffInviteForm locale={params.locale} token={params.token} email={info.email ?? ''} />
          </>
        )}
      </Card>
    </main>
  );
}
