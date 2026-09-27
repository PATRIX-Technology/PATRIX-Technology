'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOutAction } from '@/lib/actions/auth';
import type { TenantRole, TenantType } from '@/types/database';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/brand/Logo';

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

  const links = [
    { href: base, label: labels.overview },
    { href: `${base}/children`, label: labels.children },
    { href: `${base}/stories`, label: labels.stories },
    // A family account is a single guardian by default — staff invites
    // don't apply the way they do for a nursery. See docs/DECISIONS.md
    // "Phase 4: families are tenants".
    { href: `${base}/staff`, label: labels.staff, ownerOnly: true, nurseryOnly: true },
    { href: `${base}/settings`, label: labels.settings },
    { href: `/${locale}/contact`, label: labels.support },
  ].filter(
    (link) =>
      (!link.ownerOnly || role === 'nursery_owner') && (!link.nurseryOnly || tenantType === 'nursery'),
  );

  return (
    <nav className="flex w-full flex-col justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6 md:w-64 md:border-b-0 md:border-e">
      <div>
        <div className="mb-5 flex items-center gap-2.5">
          {/* The Capacitor-wrapped mobile app has no browser chrome, so
              there's otherwise no way to navigate backward at all on a
              phone — this sits in the nav's own corner rather than
              floating fixed over it, so it never fights the sidebar
              for space at any breakpoint. See docs/DECISIONS.md
              "Mobile: Capacitor wrapper for Android + iOS". */}
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={common('back')}
            className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--color-border))] text-ink-600 transition-colors hover:bg-ink-100"
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
          <div className="flex items-center gap-2.5 font-display text-lg text-ink-900">
            <Logo size={24} />
            {brand('name')}
          </div>
        </div>
        <p className="font-display text-lg text-ink-900">{tenantName}</p>
        <Badge tone="info" className="mt-1">
          {tenantType === 'family' ? 'family account' : role.replace('nursery_', '')}
        </Badge>
        {/* Deliberately styled apart from the plain nav links below (a
            gift icon + gold accent) and placed right under the tenant
            header, so it's the first thing seen on every dashboard page
            regardless of which one is active — this is a growth lever,
            not routine navigation. See docs/DECISIONS.md "Referral
            program replaces gifting". */}
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
        <ul className="mt-6 flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`focus-ring block rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === link.href
                    ? 'bg-lagoon-900/50 text-lagoon-300'
                    : 'text-ink-600 hover:bg-ink-100'
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8 flex items-center justify-between text-sm text-ink-500">
        <span>{fullName}</span>
        <form action={signOutAction.bind(null, locale)}>
          <button type="submit" className="focus-ring font-medium text-coral-600">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
