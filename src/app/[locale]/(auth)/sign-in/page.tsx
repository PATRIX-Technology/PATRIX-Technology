import { useTranslations } from 'next-intl';
import { SignInForm } from '@/components/auth/SignInForm';
import { PhoneSignInForm } from '@/components/auth/PhoneSignInForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AccountTypeTabs } from '@/components/auth/AccountTypeTabs';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import Link from 'next/link';

export default function SignInPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { authError?: string };
}) {
  const t = useTranslations('auth.signIn');
  const tPhone = useTranslations('auth.phone');
  const tAccountType = useTranslations('auth.accountType');
  const tGoogle = useTranslations('auth.google');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-6 font-display text-2xl text-ink-900">{t('title')}</h1>
      {searchParams.authError && (
        <p role="alert" className="mb-4 text-sm text-coral-600">
          {tGoogle('error')}
        </p>
      )}
      <GoogleAuthButton flow="signin" locale={params.locale} label={tGoogle('continueWith')} />
      <AuthDivider label={tGoogle('orDivider')} />
      <AuthMethodTabs
        emailLabel={tPhone('emailTab')}
        phoneLabel={tPhone('phoneTab')}
        emailContent={<SignInForm locale={params.locale} />}
        phoneContent={<PhoneSignInForm locale={params.locale} />}
      />
      <Link href={`/${params.locale}/forgot-password`} className="mt-3 inline-block text-sm font-medium text-lagoon-600">
        {t('forgotPassword')}
      </Link>
      <p className="mt-6 text-sm text-ink-500">{t('noAccount')}</p>
      <AccountTypeTabs
        active={null}
        orgHref={`/${params.locale}/sign-up`}
        familyHref={`/${params.locale}/family/sign-up`}
        orgLabel={tAccountType('organisation')}
        familyLabel={tAccountType('family')}
        className="mt-2"
      />
    </AuthShell>
  );
}
