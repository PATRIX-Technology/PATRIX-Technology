'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * "Continue with Google" for sign-in and both sign-up flows (org and
 * family) — see src/app/api/auth/callback/route.ts for what happens
 * after Google redirects back. Needs Google OAuth configured as a
 * provider in the Supabase project (Authentication → Providers →
 * Google, with a Google Cloud OAuth client's ID/secret) before this
 * button does anything but show a Supabase error — see
 * docs/NEEDS_FROM_ME.md.
 */
export function GoogleAuthButton({
  flow,
  locale,
  label,
  orgName,
  referralCode,
  disabled,
}: {
  flow: 'signin' | 'org' | 'family';
  locale: string;
  label: string;
  /** Required (and validated by the caller, via `disabled`) for flow="org" —
   * Google's own profile has no organisation name to give us, so this has
   * to be collected before the redirect to Google even happens. */
  orgName?: string;
  referralCode?: string;
  /** Caller-driven, e.g. "org name field is still empty" for flow="org". */
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  async function handleClick() {
    setError(null);
    setIsRedirecting(true);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const callbackUrl = new URL('/api/auth/callback', appUrl);
    callbackUrl.searchParams.set('locale', locale);
    callbackUrl.searchParams.set('flow', flow);
    if (flow === 'org' && orgName) callbackUrl.searchParams.set('orgName', orgName);
    if (referralCode) callbackUrl.searchParams.set('ref', referralCode);

    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setIsRedirecting(false);
    }
    // On success the browser is already navigating to Google — nothing
    // else to do here.
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isRedirecting}
        className="focus-ring flex items-center justify-center gap-2.5 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-4 py-2.5 text-sm font-medium text-ink-800 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.7 0-14.4 4.4-17.7 10.2z"
          />
          <path
            fill="#4CAF50"
            d="M24 43.5c5 0 9.5-1.9 12.9-5.1l-6-4.9c-1.9 1.4-4.3 2.2-6.9 2.2-5.3 0-9.7-3.6-11.3-8.5l-6.6 5.1C8.8 39 15.9 43.5 24 43.5z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6 4.9C40.5 35.6 43.5 30.4 43.5 24c0-1.2-.1-2.4-.3-3.5z"
          />
        </svg>
        {label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-coral-600">
          {error}
        </p>
      )}
    </div>
  );
}
