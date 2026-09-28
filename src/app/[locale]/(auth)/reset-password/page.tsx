import { useTranslations } from 'next-intl';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AuthShell } from '@/components/auth/AuthShell';

/**
 * Landed on only via the OAuth-style callback exchanging the emailed
 * reset link's code for a real (short-lived "recovery") session — see
 * src/app/api/auth/callback/route.ts's "recovery" flow. Never linked to
 * directly from the app itself.
 */
export default function ResetPasswordPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('auth.resetPassword');
  const marketing = useTranslations('marketing');
  const brand = useTranslations('brand');

  return (
    <AuthShell locale={params.locale} eyebrow={marketing('hero.eyebrow')} tagline={brand('tagline')}>
      <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-600">{t('body')}</p>
      <ResetPasswordForm locale={params.locale} />
    </AuthShell>
  );
}
