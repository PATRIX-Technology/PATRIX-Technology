import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/brand/Logo';

type LegalTab = 'tos' | 'privacy' | 'pdpl';
const TABS: LegalTab[] = ['tos', 'privacy', 'pdpl'];

// Public page — reachable signed-out as well as signed-in, which matters
// for PDPL: a privacy policy only a logged-in user can see isn't doing
// its job. Tab state lives in the URL (?tab=) rather than client state,
// so each policy is independently linkable (the sign-up forms deep-link
// straight to #privacy) and no client JS is needed to render any of it.
export default function LegalPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { tab?: string };
}) {
  const t = useTranslations('legalPage');
  const activeTab: LegalTab = TABS.includes(searchParams.tab as LegalTab) ? (searchParams.tab as LegalTab) : 'tos';
  const contactHref = `/${params.locale}/contact`;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href={`/${params.locale}`} className="focus-ring mb-8 inline-flex items-center gap-2.5 font-display text-lg text-ink-900">
          <Logo size={24} />
          <span>{t('title')}</span>
        </Link>

        <p className="mb-2 text-ink-600">
          <InterpolatedBody body={t.raw('intro')} contactHref={contactHref} contactLabel={t('contactLinkLabel')} />
        </p>
        <p className="mb-8 text-sm text-ink-500">{t('lastUpdated')}</p>

        <div className="mb-8 inline-flex flex-wrap gap-1 rounded-xl border border-[rgb(var(--color-border))] p-1" role="tablist" aria-label={t('title')}>
          {TABS.map((tab) => (
            <Link
              key={tab}
              href={`/${params.locale}/legal?tab=${tab}`}
              role="tab"
              aria-selected={activeTab === tab}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-lagoon-600 text-white' : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              {t(`tabs.${tab}`)}
            </Link>
          ))}
        </div>

        <Card>
          <h1 className="mb-2 font-display text-2xl text-ink-900">{t(`${activeTab}.heading`)}</h1>
          <p className="mb-6 rounded-lg border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-3 text-xs text-ink-500">
            {t('entityNote')}
          </p>
          <div className="space-y-6">
            {t.raw(`${activeTab}.sections`).map((section: { heading: string; body: string }) => (
              <section key={section.heading}>
                <h2 className="mb-1.5 font-display text-base text-ink-900">{section.heading}</h2>
                <p className="text-sm leading-relaxed text-ink-600">
                  {section.body.includes('{contact}') ? (
                    <InterpolatedBody body={section.body} contactHref={contactHref} contactLabel={t('contactLinkLabel')} />
                  ) : (
                    section.body
                  )}
                </p>
              </section>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}

function ContactLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="focus-ring font-medium text-lagoon-600 hover:text-lagoon-500">
      {label}
    </Link>
  );
}

// `t.raw(...)` sections keep `{contact}` as a literal placeholder (raw
// values skip next-intl's own ICU interpolation), so a body containing
// it is split and re-joined around a real link rather than left as
// unreadable template syntax.
function InterpolatedBody({ body, contactHref, contactLabel }: { body: string; contactHref: string; contactLabel: string }) {
  const [before, after] = body.split('{contact}');
  return (
    <>
      {before}
      <ContactLink href={contactHref} label={contactLabel} />
      {after}
    </>
  );
}
