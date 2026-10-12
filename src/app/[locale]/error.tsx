'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

/**
 * Without this file, Next.js shows its own generic fallback for any
 * error thrown while rendering a page under this locale segment --
 * "Application error: a client-side exception has occurred", with no
 * branding and no way for a customer to recover gracefully.
 *
 * This used to show the real error.message/digest/stack directly on
 * screen -- useful while this was still an internal build with no real
 * customers, so a screenshot was enough to report a bug (see git
 * history). Now that real families/nurseries can hit this page, a raw
 * stack trace is the wrong thing to show them: it reads as broken and
 * untrustworthy, and means nothing to someone who isn't debugging it.
 * See docs/DECISIONS.md "Client-side crashes notify the founder instead
 * of showing the user a raw error" -- the customer now sees a plain,
 * reassuring message, while the full technical details are POSTed to
 * /api/report-client-error and emailed to the founder automatically, so
 * nothing is lost, it just no longer needs a customer to screenshot it.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);

    fetch('/api/report-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        url: typeof window !== 'undefined' ? window.location.href : pathname,
      }),
    }).catch(() => {
      // Best-effort -- see module comment above.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-4 px-4 py-12">
      <h1 className="font-display text-2xl text-ink-900">Something went wrong</h1>
      <p className="text-sm text-ink-600">
        This wasn&apos;t caused by anything you did. We&apos;ve been notified automatically and are
        looking into it -- please try again in a moment.
      </p>
      {error.digest && <p className="font-mono text-xs text-ink-400">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="focus-ring rounded-lg bg-lagoon-600 px-4 py-2 text-sm font-medium text-white hover:bg-lagoon-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="focus-ring rounded-lg border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-medium text-ink-700"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
