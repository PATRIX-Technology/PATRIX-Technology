import { useTranslations } from 'next-intl';
import { CompleteFamilyForm } from '@/components/auth/CompleteFamilyForm';
import { Card } from '@/components/ui/Card';

/**
 * Landed on after "Continue with Google" on the family sign-up page, only
 * for a first-time Google identity with no tenant yet — see
 * src/app/api/auth/callback/route.ts. Unlike the organisation equivalent
 * (complete-organisation), Google's profile already gives us everything
 * create_family_tenant needs (just a name) — this page exists purely to
 * show the mandatory legal-agreement checkbox, which the callback route
 * (a redirect-only handler, not a form) has no way to render.
 */
export default function CompleteFamilyPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { fullName?: string; ref?: string };
}) {
  const t = useTranslations('auth.completeFamily');
  const fullName = searchParams.fullName ?? '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="mb-2 font-display text-2xl text-ink-900">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-600">{t('body', { fullName })}</p>
        <CompleteFamilyForm locale={params.locale} fullName={fullName} referralCode={searchParams.ref} />
      </Card>
    </main>
  );
}
