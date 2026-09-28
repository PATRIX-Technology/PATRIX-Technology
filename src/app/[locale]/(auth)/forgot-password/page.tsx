import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { AuthShell } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('auth.forgotPassword');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-600">{t('body')}</p>
      <ForgotPasswordForm locale={params.locale} />
      <p className="mt-6 text-sm text-ink-500">
        <Link href={`/${params.locale}/sign-in`} className="font-medium text-lagoon-600">
          {t('backToSignIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
