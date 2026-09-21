import { getTranslations } from 'next-intl/server';
import { getConsentInfo } from '@/lib/actions/consent-public';
import { Card } from '@/components/ui/Card';
import { ConsentResponseForm } from '@/components/consent/ConsentResponseForm';

export default async function ConsentPage({
  params,
}: {
  params: { locale: string; token: string };
}) {
  const t = await getTranslations('consent');
  const info = await getConsentInfo(params.token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-lg text-center">
        {!info.found ? (
          <p className="text-ink-600">This consent link is invalid or has expired.</p>
        ) : info.status !== 'pending' ? (
          <p className="text-ink-600">This consent request has already been answered. Thank you.</p>
        ) : (
          <>
            <h1 className="mb-4 font-display text-xl text-ink-900">
              {t('parentTitle', { childName: info.childFirstName ?? '' })}
            </h1>
            <p className="mb-6 text-ink-600">
              {t('parentBody', {
                childName: info.childFirstName ?? '',
                orgName: info.organisationName ?? '',
              })}
            </p>
            <ConsentResponseForm token={params.token} />
          </>
        )}
      </Card>
    </main>
  );
}
