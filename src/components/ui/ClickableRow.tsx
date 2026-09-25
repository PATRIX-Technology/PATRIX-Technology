'use client';

import { useRouter } from 'next/navigation';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

/**
 * A `<tr>` that navigates on click anywhere in the row (not just the one
 * linked cell) with a visible hover/pressed state, so tapping a row on
 * a touchscreen feels answered. The row stays a real `<tr>` - only the
 * navigation and feedback states are added - so existing `<td>` markup,
 * including the real `<Link>` for keyboard/screen-reader users, is
 * unchanged.
 */
export function ClickableRow({
  href,
  className = '',
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function go(event: MouseEvent | KeyboardEvent) {
    // Don't hijack a click on an actual link/button inside the row (e.g.
    // opening in a new tab via middle-click, or a future row action).
    if ((event.target as HTMLElement).closest('a, button')) return;
    router.push(href);
  }

  return (
    <tr
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === 'Enter') go(event);
      }}
      tabIndex={0}
      className={`cursor-pointer transition-colors hover:bg-ink-50 active:bg-ink-100 focus-ring ${className}`}
    >
      {children}
    </tr>
  );
}
