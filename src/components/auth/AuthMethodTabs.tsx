'use client';

import { useState, type ReactNode } from 'react';

export type AuthMethod = 'email' | 'phone';

/**
 * Shared Email/Phone toggle for the sign-in and sign-up pages — a render
 * prop rather than a fixed pair of slots so each page decides what its
 * own Email and Phone forms actually look like.
 */
export function AuthMethodTabs({
  emailLabel,
  phoneLabel,
  children,
}: {
  emailLabel: string;
  phoneLabel: string;
  children: (method: AuthMethod) => ReactNode;
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
      {children(method)}
    </div>
  );
}
