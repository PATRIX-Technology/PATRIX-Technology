'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { getReferralSummaryAction } from '@/lib/actions/referrals';
import type { ReferralSummary } from '@/types/database';

/**
 * Replaces the old "Redeem a gift code" settings card — see
 * docs/DECISIONS.md "Referral program replaces gifting". Points the
 * invite link at whichever sign-up flow matches this tenant's own type,
 * since that's who they're realistically inviting (a family inviting
 * another family, a nursery inviting another nursery).
 */
export function InviteFriendsCard({ locale, tenantType }: { locale: string; tenantType: 'nursery' | 'family' }) {
  const t = useTranslations('referrals');
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getReferralSummaryAction().then(setSummary);
  }, []);

  const signUpPath = tenantType === 'family' ? 'family/sign-up' : 'sign-up';
  const inviteUrl =
    summary?.referral_code && typeof window !== 'undefined'
      ? `${window.location.origin}/${locale}/${signUpPath}?ref=${summary.referral_code}`
      : '';

  async function handleCopy() {
    if (!inviteUrl) return;
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
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <p className="mt-2 text-sm text-ink-600">{t('body')}</p>
      {summary?.referral_code ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
              {inviteUrl}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? t('copied') : t('copyLink')}
            </Button>
          </div>
          <p className="mt-3 text-sm text-ink-600">
            {t('stats', {
              pending: summary.pending_count,
              rewarded: summary.rewarded_count,
              stories: summary.total_stories_earned,
            })}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-500">{t('loading')}</p>
      )}
    </Card>
  );
}
