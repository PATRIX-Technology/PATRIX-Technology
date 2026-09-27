import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FamilySignUpForm } from '@/components/auth/FamilySignUpForm';
import { PhoneFamilySignUpForm } from '@/components/auth/PhoneFamilySignUpForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { Card } from '@/components/ui/Card';

export default function FamilySignUpPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { ref?: string };
}) {
  const t = useTranslations('auth.familySignUp');
  const tSignUp = useTranslations('auth.signUp');
  const tPhone = useTranslations('auth.phone');
  const referralCode = typeof searchParams.ref === 'string' ? searchParams.ref : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-600">
          {t('body')}{' '}
          <Link
            href={`/${params.locale}/sign-up${referralCode ? `?ref=${referralCode}` : ''}`}
            className="font-medium text-lagoon-600"
          >
            {t('orgLink')}
          </Link>
          .
        </p>
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
