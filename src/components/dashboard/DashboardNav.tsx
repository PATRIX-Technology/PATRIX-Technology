'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/lib/actions/auth';
import type { TenantRole, TenantType } from '@/types/database';
import { Badge } from '@/components/ui/Badge';

interface Labels {
  overview: string;
  children: string;
  stories: string;
  templates: string;
  staff: string;
  settings: string;
  usage: string;
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
  ].filter(
    (link) =>
      (!link.ownerOnly || role === 'nursery_owner') && (!link.nurseryOnly || tenantType === 'nursery'),
  );

  return (
    <nav className="flex w-full flex-col justify-between border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6 md:w-64 md:border-b-0 md:border-e">
      <div>
        <p className="font-display text-lg text-ink-900">{tenantName}</p>
        <Badge tone="info" className="mt-1">
          {tenantType === 'family' ? 'family account' : role.replace('nursery_', '')}
        </Badge>
        <ul className="mt-8 flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`focus-ring block rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === link.href ? 'bg-lagoon-100 text-lagoon-800' : 'text-ink-600 hover:bg-ink-100'
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
