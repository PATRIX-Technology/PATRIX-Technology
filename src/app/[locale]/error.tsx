'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Without this file, Next.js shows its own generic fallback for any
 * error thrown while rendering a page under this locale segment --
 * "Application error: a server-side/client-side exception has
 * occurred", with a bare digest and nothing else, in production. That
 * blocked diagnosing every crash reported during this build: there was
 * no way to see the actual error message or stack short of the
 * founder's own Vercel dashboard access. This shows the real
 * error.message and, for a genuine client-side exception (thrown after
 * the page already reached the browser, never serialized from the
 * server), the full stack too -- copyable directly from a screenshot,
 * no devtools needed. A server-side exception still only exposes
 * `digest` here by Next.js's own design (the original error and its
 * stack never leave the server for those) -- those still need the
 * founder's Vercel dashboard logs; this only covers the client-side
 * half of that gap.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-4 py-12">
      <h1 className="font-display text-2xl text-ink-900">Something went wrong</h1>
      <p className="text-sm text-ink-600">
        This screen only appears in a bug — nothing you did caused it. Please screenshot the box
        below and share it so it can be fixed.
      </p>
      <div className="w-full rounded-xl2 border border-coral-300 bg-coral-50 p-4">
        <p className="font-mono text-sm font-semibold text-coral-800">{error.message || 'Unknown error'}</p>
        {error.digest && <p className="mt-1 font-mono text-xs text-coral-700">Digest: {error.digest}</p>}
        {error.stack && (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-coral-700">
            {error.stack}
          </pre>
        )}
      </div>
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
