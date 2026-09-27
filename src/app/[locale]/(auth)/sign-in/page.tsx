import { useTranslations } from 'next-intl';
import { SignInForm } from '@/components/auth/SignInForm';
import { PhoneSignInForm } from '@/components/auth/PhoneSignInForm';
import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AccountTypeTabs } from '@/components/auth/AccountTypeTabs';
import { AuthShell } from '@/components/auth/AuthShell';

export default function SignInPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('auth.signIn');
  const tPhone = useTranslations('auth.phone');
  const tAccountType = useTranslations('auth.accountType');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-6 font-display text-2xl text-ink-900">{t('title')}</h1>
      <AuthMethodTabs
        emailLabel={tPhone('emailTab')}
        phoneLabel={tPhone('phoneTab')}
        emailContent={<SignInForm locale={params.locale} />}
        phoneContent={<PhoneSignInForm locale={params.locale} />}
      />
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
