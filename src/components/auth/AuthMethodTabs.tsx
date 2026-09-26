'use client';

import { useState, type ReactNode } from 'react';

export type AuthMethod = 'email' | 'phone';

/**
 * Shared Email/Phone toggle for the sign-in and sign-up pages. Takes both
 * forms as plain ReactNode props (not a render-prop function) because
 * every caller here is a Server Component: passing a function as
 * children/props from a Server Component to a Client Component like this
 * one isn't serialisable and crashes with a server-side exception (see
 * docs/DECISIONS.md "Server-to-client function props on auth pages").
 */
export function AuthMethodTabs({
  emailLabel,
  phoneLabel,
  emailContent,
  phoneContent,
}: {
  emailLabel: string;
  phoneLabel: string;
  emailContent: ReactNode;
  phoneContent: ReactNode;
}) {
  const [method, setMethod] = useState<AuthMethod>('email');

  return (
    <div className="flex flex-col gap-5">
      <div
        className="inline-flex self-start rounded-xl border border-[rgb(var(--color-border))] p-1"
        role="tablist"
        aria-label="Sign-in method"
      >
        {(
          [
            ['email', emailLabel],
            ['phone', phoneLabel],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={method === value}
            onClick={() => setMethod(value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              method === value ? 'bg-lagoon-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {method === 'email' ? emailContent : phoneContent}
    </div>
  );
}
