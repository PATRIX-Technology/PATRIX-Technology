'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

/**
 * The interactive part of the invite page — copy-to-clipboard needs a
 * client component, but the referral code and app URL are known
 * server-side, so they're passed in as props rather than fetched here.
 * That matters: building the URL from `window.location.origin` at
 * render time would mismatch between the server-rendered HTML (no
 * `window`) and the client's hydration pass (has `window`) — a classic
 * hydration-mismatch bug. `appUrl` sidesteps it entirely.
 */
export function InviteLinkBox({
  appUrl,
  locale,
  tenantType,
  referralCode,
}: {
  appUrl: string;
  locale: string;
  tenantType: 'nursery' | 'family';
  referralCode: string;
}) {
  const t = useTranslations('referrals');
  const [copied, setCopied] = useState(false);

  const signUpPath = tenantType === 'family' ? 'family/sign-up' : 'sign-up';
  const inviteUrl = `${appUrl}/${locale}/${signUpPath}?ref=${referralCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (older browsers, some embedded
      // views) — the link is still shown as selectable text below, so
      // this failure needs no user-facing error.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
        {inviteUrl}
      </code>
      <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
        {copied ? t('copied') : t('copyLink')}
      </Button>
    </div>
  );
}
