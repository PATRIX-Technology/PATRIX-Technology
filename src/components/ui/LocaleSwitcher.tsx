'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';

const LOCALE_LABEL: Record<Locale, string> = { en: 'EN', ar: 'AR' };

/**
 * Every route lives under a `[locale]` segment with `localePrefix:
 * 'always'` (see src/middleware.ts) — no cookie or client-side state
 * decides the language, the URL is the single source of truth, and
 * every string in the app already has a matching Arabic translation
 * (src/messages/ar.json is 1:1 with en.json). So "switching the app's
 * language" is just navigating to the same path under the other
 * locale segment; this reads the current path directly from
 * next/navigation (not a next-intl pathname wrapper — this codebase
 * doesn't use one, every existing link already builds hrefs as plain
 * `/${locale}/...` strings) and swaps only that first segment,
 * preserving whatever page the viewer is actually on.
 */
export function LocaleSwitcher({ locale, className = '' }: { locale: Locale; className?: string }) {
  const pathname = usePathname();

  function hrefFor(target: Locale): string {
    const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '/';
    return `/${target}${rest}`;
  }

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-[rgb(var(--color-border))] p-1 ${className}`}
      role="group"
      aria-label="Language"
    >
      {locales.map((target) => (
        <Link
          key={target}
          href={hrefFor(target)}
          aria-current={target === locale ? 'true' : undefined}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
            target === locale ? 'bg-lagoon-600 text-white' : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          {LOCALE_LABEL[target]}
        </Link>
      ))}
    </div>
  );
}
