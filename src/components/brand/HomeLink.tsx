'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Wraps the Ownly brand mark wherever it acts as a "go home" link on a
 * public page (marketing header/footer, auth shell, legal, contact).
 * Resolves client-side which "home" that is: the dashboard if a session
 * already exists, the marketing landing page otherwise. A small client
 * leaf inside otherwise server-rendered pages -- checking auth via the
 * browser client's local session read (no network round-trip in the
 * common case) rather than a server-side Supabase call, which would force
 * these pages out of static rendering. Takes children so each call site
 * keeps its own exact markup (logo + wordmark, "← Ownly", logo + page
 * title, ...).
 */
export function HomeLink({
  locale,
  className,
  children,
}: {
  locale: string;
  className?: string;
  children: ReactNode;
}) {
  const [href, setHref] = useState(`/${locale}`);

  useEffect(() => {
    let cancelled = false;
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session) setHref(`/${locale}/dashboard`);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
