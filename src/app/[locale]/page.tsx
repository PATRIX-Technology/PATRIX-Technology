import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function MarketingHome({ params }: { params: { locale: string } }) {
  const t = useTranslations('marketing');
  const nav = useTranslations('nav');
  const brand = useTranslations('brand');
  const locale = params.locale;

  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl text-ink-900">{brand('name')}</span>
        <nav className="flex items-center gap-6 text-sm text-ink-700">
          <Link href={`/${locale}/family/sign-up`} className="focus-ring rounded">
            {nav('forFamilies')}
          </Link>
          <Link href={`/${locale}/sign-in`} className="focus-ring rounded">
            {nav('signIn')}
          </Link>
          <Link href={`/${locale}/sign-up`}>
            <Button size="sm">{nav('getStarted')}</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-lagoon-600">
          {t('hero.eyebrow')}
        </p>
        <h1 className="mb-6 font-display text-4xl leading-tight text-ink-900 md:text-5xl">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-ink-600">{t('hero.body')}</p>
        <div className="flex items-center justify-center gap-4">
          <Link href={`/${locale}/sign-up`}>
            <Button size="lg">{t('hero.ctaPrimary')}</Button>
          </Link>
          <a href="#use-cases">
            <Button size="lg" variant="secondary">
              {t('hero.ctaSecondary')}
            </Button>
          </a>
        </div>
        <p className="mt-10 text-sm text-ink-400">{t('trustBar')}</p>
      </section>

      <section id="use-cases" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-center font-display text-2xl text-ink-900">
          {t('useCases.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['graduation', 'loyalty', 'education', 'campaigns'] as const).map((key) => (
            <div
              key={key}
              className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-5 text-center"
            >
              <p className="font-medium text-ink-800">{t(`useCases.${key}`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
        <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-8">
          <h2 className="mb-2 font-display text-xl text-ink-900">{t('familyCallout.title')}</h2>
          <p className="mb-6 text-ink-600">{t('familyCallout.body')}</p>
          <Link href={`/${locale}/family/sign-up`}>
            <Button variant="secondary">{t('familyCallout.cta')}</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
