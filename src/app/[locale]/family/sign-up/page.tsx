import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FamilySignUpForm } from '@/components/auth/FamilySignUpForm';
import { PhoneFamilySignUpForm } from '@/components/auth/PhoneFamilySignUpForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AccountTypeTabs } from '@/components/auth/AccountTypeTabs';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { Card } from '@/components/ui/Card';

export default function FamilySignUpPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { ref?: string; authError?: string };
}) {
  const t = useTranslations('auth.familySignUp');
  const tSignUp = useTranslations('auth.signUp');
  const tPhone = useTranslations('auth.phone');
  const tAccountType = useTranslations('auth.accountType');
  const tGoogle = useTranslations('auth.google');
  const referralCode = typeof searchParams.ref === 'string' ? searchParams.ref : undefined;
  const refQuery = referralCode ? `?ref=${referralCode}` : '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md">
        <AccountTypeTabs
          active="family"
          orgHref={`/${params.locale}/sign-up${refQuery}`}
          familyHref={`/${params.locale}/family/sign-up${refQuery}`}
          orgLabel={tAccountType('organisation')}
          familyLabel={tAccountType('family')}
          className="mb-6"
        />
        <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-600">{t('body')}</p>
        {searchParams.authError && (
          <p role="alert" className="mb-4 text-sm text-coral-600">
            {tGoogle('error')}
          </p>
        )}
        <GoogleAuthButton flow="family" locale={params.locale} label={tGoogle('continueWith')} referralCode={referralCode} />
        <AuthDivider label={tGoogle('orDivider')} />
        <AuthMethodTabs
          emailLabel={tPhone('emailTab')}
          phoneLabel={tPhone('phoneTab')}
          emailContent={<FamilySignUpForm locale={params.locale} referralCode={referralCode} />}
          phoneContent={<PhoneFamilySignUpForm locale={params.locale} referralCode={referralCode} />}
        />
        <p className="mt-6 text-center text-sm text-ink-500">
          {tSignUp('haveAccount')}{' '}
          <Link href={`/${params.locale}/sign-in`} className="font-medium text-lagoon-600">
            {tSignUp('signInInstead')}
          </Link>
        </p>
      </Card>
    </main>
  );
}
