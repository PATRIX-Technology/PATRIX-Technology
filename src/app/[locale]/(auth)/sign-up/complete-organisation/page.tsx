import { useTranslations } from 'next-intl';
import { CompleteOrganisationForm } from '@/components/auth/CompleteOrganisationForm';
import { AuthShell } from '@/components/auth/AuthShell';

/**
 * Landed on after "Continue with Google" on the organisation sign-up
 * page, only for a first-time Google identity with no tenant yet — see
 * src/app/api/auth/callback/route.ts. Google's own profile has no
 * organisation name to give us, so this is the one field genuinely
 * missing before create_tenant can run.
 */
export default function CompleteOrganisationPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { fullName?: string; ref?: string };
}) {
  const t = useTranslations('auth.completeOrganisation');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-600">{t('body')}</p>
      <CompleteOrganisationForm
        locale={params.locale}
        defaultFullName={searchParams.fullName ?? ''}
        referralCode={searchParams.ref}
      />
    </AuthShell>
  );
}
