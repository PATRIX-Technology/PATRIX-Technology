import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { PhoneNurserySignUpForm } from '@/components/auth/PhoneNurserySignUpForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AuthShell } from '@/components/auth/AuthShell';

export default function SignUpPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('auth.signUp');
  const tPhone = useTranslations('auth.phone');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-6 font-display text-2xl text-ink-900">{t('title')}</h1>
      <AuthMethodTabs emailLabel={tPhone('emailTab')} phoneLabel={tPhone('phoneTab')}>
        {(method) =>
          method === 'email' ? (
            <SignUpForm locale={params.locale} />
          ) : (
            <PhoneNurserySignUpForm locale={params.locale} />
          )
        }
      </AuthMethodTabs>
      <p className="mt-6 text-center text-sm text-ink-500">
        {t('haveAccount')}{' '}
        <Link href={`/${params.locale}/sign-in`} className="font-medium text-lagoon-600">
          {t('signInInstead')}
        </Link>
      </p>
    </AuthShell>
  );
}
