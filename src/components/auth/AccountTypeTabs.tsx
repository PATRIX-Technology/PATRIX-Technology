import Link from 'next/link';

/**
 * Segmented-control-styled links for switching between the organisation
 * and family account flows. Visually matches `AuthMethodTabs` (the
 * Email/Phone toggle) so the two read as one consistent tab system, but
 * these are real `<Link>`s rather than client-side state: organisation
 * and family sign-up are separate routes (each with its own server
 * action and form), and sign-in needs the same control without either
 * side ever being "active".
 */
export function AccountTypeTabs({
  active,
  orgHref,
  familyHref,
  orgLabel,
  familyLabel,
  className = '',
}: {
  active: 'org' | 'family' | null;
  orgHref: string;
  familyHref: string;
  orgLabel: string;
  familyLabel: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex self-start rounded-xl border border-[rgb(var(--color-border))] p-1 ${className}`}
      role="tablist"
      aria-label="Account type"
    >
      {(
        [
          ['org', orgLabel, orgHref],
          ['family', familyLabel, familyHref],
        ] as const
      ).map(([value, label, href]) => (
        <Link
          key={value}
          href={href}
          role="tab"
          aria-selected={active === value}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            active === value ? 'bg-lagoon-600 text-white' : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
