import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { PhoneNurserySignUpForm } from '@/components/auth/PhoneNurserySignUpForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AccountTypeTabs } from '@/components/auth/AccountTypeTabs';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { LegalAgreementNote } from '@/components/auth/LegalAgreementNote';

export default function SignUpPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { ref?: string; authError?: string; googleNoAccount?: string };
}) {
  const t = useTranslations('auth.signUp');
  const tPhone = useTranslations('auth.phone');
  const tAccountType = useTranslations('auth.accountType');
  const tGoogle = useTranslations('auth.google');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');
  const referralCode = typeof searchParams.ref === 'string' ? searchParams.ref : undefined;
  const refQuery = referralCode ? `?ref=${referralCode}` : '';

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <AccountTypeTabs
        active="org"
        orgHref={`/${params.locale}/sign-up${refQuery}`}
        familyHref={`/${params.locale}/family/sign-up${refQuery}`}
        orgLabel={tAccountType('organisation')}
        familyLabel={tAccountType('family')}
        className="mb-6"
      />
      <h1 className="mb-6 font-display text-2xl text-ink-900">{t('title')}</h1>
      {(searchParams.authError || searchParams.googleNoAccount) && (
        <p role="alert" className="mb-4 text-sm text-coral-600">
          {searchParams.googleNoAccount ? tGoogle('noAccount') : tGoogle('error')}
        </p>
      )}
      <GoogleAuthButton flow="org" locale={params.locale} label={tGoogle('continueWith')} referralCode={referralCode} />
      <AuthDivider label={tGoogle('orDivider')} />
      <AuthMethodTabs
        emailLabel={tPhone('emailTab')}
        phoneLabel={tPhone('phoneTab')}
        emailContent={<SignUpForm locale={params.locale} referralCode={referralCode} />}
        phoneContent={<PhoneNurserySignUpForm locale={params.locale} referralCode={referralCode} />}
      />
      <p className="mt-6 text-center text-sm text-ink-500">
        {t('haveAccount')}{' '}
        <Link href={`/${params.locale}/sign-in`} className="font-medium text-lagoon-600">
          {t('signInInstead')}
        </Link>
      </p>
      <LegalAgreementNote locale={params.locale} />
    </AuthShell>
  );
}
