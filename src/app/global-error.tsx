'use client';

import { useEffect } from 'react';

/**
 * [locale]/error.tsx only catches errors thrown inside the locale
 * segment's own subtree -- an error thrown in the root layout
 * (src/app/layout.tsx) or anything above the locale boundary falls
 * through it entirely, and Next.js shows its own unbranded generic
 * fallback instead ("Application error: a client-side exception has
 * occurred"), exactly what a real customer hit and reported. This file
 * is the only thing that can catch that: Next.js requires it to render
 * its own complete <html>/<body> (it replaces the ENTIRE root layout,
 * providers included, when it fires), so no Tailwind/next-intl/font
 * setup is assumed here -- deliberately minimal inline styles only, so
 * this can't itself fail to render. Reports to the same place as
 * [locale]/error.tsx -- see docs/DECISIONS.md "Client-side crashes
 * notify the founder instead of showing the user a raw error".
 *
 * "Try again" does a hard `window.location.reload()` rather than the
 * `reset` prop Next.js provides -- see the matching note in
 * [locale]/error.tsx. `reset()` alone re-renders the same broken tree and
 * reproduces the same crash; a reload actually re-runs the page load.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);

    fetch('/api/report-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    }).catch(() => {
      // Best-effort -- see module comment above.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#14152B', color: '#FDFDFD' }}>
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#C9CDD6', margin: 0 }}>
            This wasn&apos;t caused by anything you did. We&apos;ve been notified automatically and are
            looking into it -- please try again in a moment.
          </p>
          {error.digest && (
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#8A8F9C', margin: 0 }}>
              Reference: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: '#2FBFA6',
                color: '#06241F',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: '1px solid #3A3D52',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                color: '#FDFDFD',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
