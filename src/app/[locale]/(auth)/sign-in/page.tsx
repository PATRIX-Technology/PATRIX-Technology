import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { SignInForm } from '@/components/auth/SignInForm';
import { PhoneSignInForm } from '@/components/auth/PhoneSignInForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AuthShell } from '@/components/auth/AuthShell';

export default function SignInPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('auth.signIn');
  const tPhone = useTranslations('auth.phone');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-6 font-display text-2xl text-ink-900">{t('title')}</h1>
      <AuthMethodTabs emailLabel={tPhone('emailTab')} phoneLabel={tPhone('phoneTab')}>
        {(method) =>
          method === 'email' ? (
            <SignInForm locale={params.locale} />
          ) : (
            <PhoneSignInForm locale={params.locale} />
          )
        }
      </AuthMethodTabs>
      <p className="mt-6 text-center text-sm text-ink-500">
        {t('noAccount')}{' '}
        <Link href={`/${params.locale}/sign-up`} className="font-medium text-lagoon-600">
          {t('createOne')}
        </Link>
      </p>
    </AuthShell>
  );
}
