import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { Card } from '@/components/ui/Card';

export default function SignUpPage({ params }: { params: { locale: string } }) {
  const t = useTranslations('auth.signUp');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--color-surface))] px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 font-display text-2xl text-ink-900">{t('title')}</h1>
        <SignUpForm locale={params.locale} />
        <p className="mt-6 text-center text-sm text-ink-500">
          {t('haveAccount')}{' '}
          <Link href={`/${params.locale}/sign-in`} className="font-medium text-lagoon-600">
            {t('signInInstead')}
          </Link>
        </p>
      </Card>
    </main>
  );
}
