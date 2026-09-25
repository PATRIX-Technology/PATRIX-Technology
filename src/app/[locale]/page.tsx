import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';

const USE_CASE_ICONS: Record<string, JSX.Element> = {
  graduation: (
    <path
      d="M3 9 12 4l9 5-9 5-9-5Zm4 2.2V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.8"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  loyalty: (
    <path
      d="M12 20s-7-4.2-9.3-8.4C.9 8.4 3 5 6.5 5c2 0 3.3 1 5.5 3.3C14.2 6 15.5 5 17.5 5 21 5 23.1 8.4 21.3 11.6 19 15.8 12 20 12 20Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  education: (
    <path
      d="M12 3c2 3 5 6 5 10a5 5 0 0 1-10 0c0-4 3-7 5-10Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  campaigns: (
    <path
      d="M4 9v6h4l6 4V5L8 9H4Zm14.5-1a4 4 0 0 1 0 8"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export default function MarketingHome({ params }: { params: { locale: string } }) {
  const t = useTranslations('marketing');
  const nav = useTranslations('nav');
  const brand = useTranslations('brand');
  const locale = params.locale;
  const heroImage = locale === 'ar' ? '/images/marketing/hero-ar.jpg' : '/images/marketing/hero-en.jpg';

  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2.5 font-display text-xl text-ink-900">
          <Logo size={30} variant="flat" />
          {brand('name')}
        </span>
        <nav className="hidden items-center gap-6 text-sm text-ink-600 sm:flex">
          <Link href={`/${locale}/family/sign-up`} className="focus-ring rounded hover:text-ink-800">
            {nav('forFamilies')}
          </Link>
          <Link href={`/${locale}/contact`} className="focus-ring rounded hover:text-ink-800">
            {nav('contact')}
          </Link>
          <Link href={`/${locale}/sign-in`} className="focus-ring rounded hover:text-ink-800">
            {nav('signIn')}
          </Link>
          <Link href={`/${locale}/sign-up`}>
            <Button size="sm">{nav('getStarted')}</Button>
          </Link>
        </nav>
        <Link href={`/${locale}/sign-up`} className="sm:hidden">
          <Button size="sm">{nav('getStarted')}</Button>
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-10 pt-4 md:pb-16 md:pt-10">
        <div
          className="relative overflow-hidden rounded-xl2 px-6 py-12 shadow-card md:px-14 md:py-16"
          style={{
            background:
              'radial-gradient(1.5px 1.5px at 12% 18%, rgba(244,241,232,0.5) 0, transparent 60%),' +
              'radial-gradient(1.5px 1.5px at 30% 72%, rgba(244,241,232,0.4) 0, transparent 60%),' +
              'radial-gradient(1px 1px at 52% 12%, rgba(244,241,232,0.45) 0, transparent 60%),' +
              'radial-gradient(1.5px 1.5px at 68% 55%, rgba(244,241,232,0.35) 0, transparent 60%),' +
              'radial-gradient(1px 1px at 85% 22%, rgba(244,241,232,0.5) 0, transparent 60%),' +
              'radial-gradient(1.5px 1.5px at 92% 68%, rgba(244,241,232,0.35) 0, transparent 60%),' +
              'linear-gradient(150deg, #1c1e42 0%, #14152b 55%, #100f22 100%)',
          }}
        >
          <div className="relative grid items-center gap-10 md:grid-cols-2 md:gap-14">
            <div className="flex min-w-0 flex-col items-start gap-5 text-start">
              <span className="animate-fadeIn inline-flex items-center gap-2 rounded-full border border-saffron-500/35 bg-saffron-900/25 px-3.5 py-1.5 text-xs font-semibold text-saffron-300">
                ✦ {t('hero.eyebrow')}
              </span>
              <h1 className="animate-fadeInDelay1 max-w-xl font-display text-3xl leading-tight text-ink-900 md:text-[2.75rem]">
                {t('hero.title')}
              </h1>
              <p className="animate-fadeInDelay1 max-w-lg text-base text-ink-600 md:text-lg">
                {t('hero.body')}
              </p>
              <div className="animate-fadeInDelay2 flex flex-wrap items-center gap-4 pt-2">
                <Link href={`/${locale}/sign-up`}>
                  <Button size="lg">{t('hero.ctaPrimary')}</Button>
                </Link>
                <a href="#use-cases">
                  <Button size="lg" variant="onBrandGhost">
                    {t('hero.ctaSecondary')}
                  </Button>
                </a>
              </div>
            </div>

            <div className="animate-fadeInDelay2 relative mx-auto w-full max-w-xs">
              <div className="animate-floatSlow relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-ink-100 shadow-card">
                <Image
                  src={heroImage}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 70vw, 320px"
                  className="object-cover"
                  priority
                />
              </div>
              <span className="absolute -right-4 -top-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-saffron-500 text-2xl shadow-card">
                ✦
              </span>
            </div>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-ink-500">{t('trustBar')}</p>
      </section>

      <section id="use-cases" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-center font-display text-2xl text-ink-900 md:text-3xl">
          {t('useCases.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['graduation', 'loyalty', 'education', 'campaigns'] as const).map((key) => (
            <div
              key={key}
              className="group rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6 transition-colors hover:border-lagoon-700"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-lagoon-900/50 text-lagoon-300">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  {USE_CASE_ICONS[key]}
                </svg>
              </span>
              <p className="font-medium text-ink-800">{t(`useCases.${key}`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
        <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-8">
          <h2 className="mb-2 font-display text-xl text-ink-900">{t('familyCallout.title')}</h2>
          <p className="mb-6 text-ink-600">{t('familyCallout.body')}</p>
          <Link href={`/${locale}/family/sign-up`}>
            <Button variant="secondary">{t('familyCallout.cta')}</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-[rgb(var(--color-border))] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-ink-500 sm:flex-row">
          <span className="flex items-center gap-2 font-display text-ink-700">
            <Logo size={20} variant="flat" />
            {brand('name')}
          </span>
          <Link href={`/${locale}/contact`} className="focus-ring rounded hover:text-ink-700">
            {nav('contact')}
          </Link>
        </div>
      </footer>
    </main>
  );
}
