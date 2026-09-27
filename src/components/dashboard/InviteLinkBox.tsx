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
  const shareText = t('shareText');

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

  // The Web Share API hands off to whatever the device actually has
  // installed (WhatsApp, Messenger, Telegram, Mail, SMS, AirDrop, ...)
  // via the OS's own native share sheet — no per-app integration code
  // needed, and it's the exact "click once, pick an app" flow being
  // asked for here. It needs a real user gesture and HTTPS, both true
  // for a button click on the deployed app; it's unsupported on some
  // desktop browsers (notably Firefox), so this falls back to copying
  // the link there instead of doing nothing.
  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: t('shareTitle'), text: shareText, url: inviteUrl });
      } catch {
        // AbortError (the person cancelled the share sheet) or any
        // other failure — no error toast needed either way.
      }
      return;
    }
    await handleCopy();
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${inviteUrl}`)}`;
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(t('shareTitle'))}&body=${encodeURIComponent(`${shareText}\n\n${inviteUrl}`)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
          {inviteUrl}
        </code>
        <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? t('copied') : t('copyLink')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleShare}>
          📤 {t('shareButton')}
        </Button>
        {/* Direct links as an explicit, always-visible alternative to
            the native share sheet — useful on desktop browsers that
            don't support Web Share (Firefox), and for anyone who'd
            rather pick the app straight away. */}
        <a href={whatsappHref} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary" size="sm">
            WhatsApp
          </Button>
        </a>
        <a href={telegramHref} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary" size="sm">
            Telegram
          </Button>
        </a>
        <a href={emailHref}>
          <Button type="button" variant="secondary" size="sm">
            {t('emailButton')}
          </Button>
        </a>
      </div>
    </div>
  );
}
