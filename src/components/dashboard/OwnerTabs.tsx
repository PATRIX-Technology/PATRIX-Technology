'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The owner dashboard was a single long scrolling page with no way to
 * jump straight to any one section — story idea suggestions, the thing
 * the founder actually needs to check in on regularly, were buried
 * halfway down it alongside tenants, template review status, and AI
 * spend. Split into an "Overview" tab (everything else) and a "Story
 * Ideas" tab (its own page, see docs/DECISIONS.md "A dedicated tab for
 * tracking new story idea suggestions"), with a live badge on the
 * latter showing how many are still unreviewed ("new").
 */
export function OwnerTabs({ locale, newSuggestionCount }: { locale: string; newSuggestionCount: number }) {
  const pathname = usePathname();
  const base = `/${locale}/owner`;

  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/suggestions`, label: 'Story Ideas', badge: newSuggestionCount },
  ];

  return (
    <div
      className="mb-6 inline-flex self-start rounded-xl border border-[rgb(var(--color-border))] p-1"
      role="tablist"
      aria-label="Owner dashboard sections"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-lagoon-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {tab.label}
            {Boolean(tab.badge) && (
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                  active ? 'bg-white/25 text-white' : 'bg-saffron-900/60 text-saffron-300'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
