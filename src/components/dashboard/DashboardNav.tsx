'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOutAction } from '@/lib/actions/auth';
import type { TenantRole, TenantType } from '@/types/database';
import type { Locale } from '@/i18n/config';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';

interface Labels {
  overview: string;
  children: string;
  stories: string;
  templates: string;
  staff: string;
  settings: string;
  usage: string;
  support: string;
  invite: string;
  legal: string;
}

export function DashboardNav({
  locale,
  tenantName,
  tenantType,
  fullName,
  role,
  labels,
}: {
  locale: string;
  tenantName: string;
  tenantType: TenantType;
  fullName: string;
  role: TenantRole;
  labels: Labels;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const brand = useTranslations('brand');
  const common = useTranslations('common');
  const isRtl = locale === 'ar';
  const base = `/${locale}/dashboard`;
  // Closed by default on every navigation, including the first render of
  // a tapped link, so picking a tab always lands straight on that page's
  // content instead of leaving the menu open over it.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  function handleRefresh() {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  }

  const links = [
    { href: base, label: labels.overview },
    { href: `${base}/children`, label: labels.children },
    { href: `${base}/stories`, label: labels.stories },
    // A family account is a single guardian by default — staff invites
    // don't apply the way they do for a nursery. See docs/DECISIONS.md
    // "Phase 4: families are tenants".
    { href: `${base}/staff`, label: labels.staff, ownerOnly: true, nurseryOnly: true },
    // Its own tab rather than a card inside Settings, per founder
    // feedback — see docs/DECISIONS.md "Billing moved out of Settings
    // into its own tab". ownerOnly, not nurseryOnly: a family
    // account's holder also carries the (historically-named)
    // "nursery_owner" role and has their own plan to manage.
    { href: `${base}/billing`, label: labels.usage, ownerOnly: true },
    { href: `${base}/settings`, label: labels.settings },
    { href: `/${locale}/contact`, label: labels.support },
    { href: `/${locale}/legal`, label: labels.legal },
  ].filter(
    (link) =>
      (!link.ownerOnly || role === 'nursery_owner') && (!link.nurseryOnly || tenantType === 'nursery'),
  );

  const backButton = (
    // The Capacitor-wrapped mobile app has no browser chrome, so
    // there's otherwise no way to navigate backward at all on a
    // phone — this sits in the nav's own corner rather than
    // floating fixed over it, so it never fights the sidebar
    // for space at any breakpoint. See docs/DECISIONS.md
    // "Mobile: Capacitor wrapper for Android + iOS".
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={common('back')}
      className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lagoon-900/50 text-lagoon-300 transition-colors hover:bg-lagoon-900/70"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={isRtl ? 'rotate-180' : ''}>
        <path
          d="M15 6l-6 6 6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const refreshButton = (
    // The Capacitor-wrapped app also has no pull-to-refresh/reload
    // control, so this sits beside the back button for the same reason
    // — see docs/DECISIONS.md "Mobile: Capacitor wrapper for Android +
    // iOS".
    <button
      type="button"
      onClick={handleRefresh}
      aria-label={common('refresh')}
      className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lagoon-900/50 text-lagoon-300 transition-colors hover:bg-lagoon-900/70"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className={isRefreshing ? 'animate-spin' : ''}
      >
        <path
          d="M4 4v5h5M20 20v-5h-5M4.5 9a8 8 0 0 1 14.5-3M19.5 15a8 8 0 0 1-14.5 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const brandRow = (
    <Link href={base} className="focus-ring flex items-center gap-2.5 font-display text-lg text-ink-900">
      <Logo size={24} />
      {brand('name')}
    </Link>
  );

  const linksList = (
    <ul className="mt-6 flex flex-col gap-1">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={`focus-ring block rounded-lg px-3 py-2 text-sm font-medium ${
              pathname === link.href ? 'bg-lagoon-900/50 text-lagoon-300' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  const navBody = (
    <>
      <p className="font-display text-lg text-ink-900">{tenantName}</p>
      <Badge tone="info" className="mt-1">
        {tenantType === 'family' ? 'family account' : role.replace('nursery_', '')}
      </Badge>
      {/* Deliberately styled apart from the plain nav links below (a
          gift icon + gold accent) and placed right under the tenant
          header, so it's the first thing seen regardless of which page
          is active — this is a growth lever, not routine navigation.
          See docs/DECISIONS.md "Referral program replaces gifting". */}
      <Link
        href={`${base}/invite`}
        className={`focus-ring mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
          pathname === `${base}/invite`
            ? 'bg-saffron-900/70 text-saffron-300'
            : 'bg-saffron-900/40 text-saffron-300 hover:bg-saffron-900/60'
        }`}
      >
        <span aria-hidden className="text-lg">
          🎁
        </span>
        <span>{labels.invite}</span>
      </Link>
      {linksList}
      <div className="mt-6">
        <LocaleSwitcher locale={locale as Locale} />
      </div>
    </>
  );

  const footer = (
    <div className="mt-8 flex items-center justify-between text-sm text-ink-500">
      <span>{fullName}</span>
      <form action={signOutAction.bind(null, locale)}>
        <button type="submit" className="focus-ring font-medium text-coral-600">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile: a slim top bar that never pushes page content down, with
          everything else — tenant info, nav links, locale switcher, sign
          out — tucked behind a dropdown toggle. See docs/DECISIONS.md
          "Collapsible mobile nav replaces full-height stacked nav". */}
      <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] px-4 py-3 md:hidden">
        <div className="flex items-center gap-2.5">
          {backButton}
          {refreshButton}
          {brandRow}
        </div>
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? common('closeMenu') : common('menu')}
          className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--color-border))] text-ink-700 transition-colors hover:bg-ink-100"
        >
          {isMenuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
      {isMenuOpen && (
        <div className="max-h-[calc(100vh-57px)] overflow-y-auto border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6 md:hidden">
          {navBody}
          {footer}
        </div>
      )}

      {/* Desktop: the original always-visible sidebar, unchanged. */}
      <nav className="hidden w-64 flex-col justify-between border-e border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6 md:flex">
        <div>
          <div className="mb-5 flex items-center gap-2.5">
            {backButton}
            {refreshButton}
            {brandRow}
          </div>
          {navBody}
        </div>
        {footer}
      </nav>
    </>
  );
}
