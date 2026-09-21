'use client';

import { useEffect, useState } from 'react';
import { getGiftStatus } from '@/lib/actions/gifts';
import { formatGiftCodeForDisplay } from '@/lib/domain/gifts';
import { Card } from '@/components/ui/Card';

export function GiftSuccessStatus({ locale, code }: { locale: string; code: string }) {
  const [status, setStatus] = useState<'checking' | 'paid' | 'pending' | 'not_found'>('checking');
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await getGiftStatus(code);
      if (cancelled) return;
      if (!result.found) {
        setStatus('not_found');
        return;
      }
      if (result.status === 'paid' || result.status === 'redeemed') {
        setStatus('paid');
        return;
      }
      setStatus('pending');
      if (attempts < 10) {
        setTimeout(() => setAttempts((a) => a + 1), 2000);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempts]);

  const redeemUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/gift/redeem/${code}`;

  return (
    <Card className="mx-auto max-w-lg text-center">
      {status === 'checking' || status === 'pending' ? (
        <p className="text-ink-600">Confirming your payment…</p>
      ) : status === 'not_found' ? (
        <p className="text-coral-600">We couldn&apos;t find that gift. Please contact support.</p>
      ) : (
        <>
          <h1 className="mb-2 font-display text-xl text-ink-900">Thank you!</h1>
          <p className="mb-4 text-ink-600">Share this code (or the link below) with the family:</p>
          <code className="mb-4 block rounded-lg bg-ink-50 p-4 text-2xl tracking-widest text-ink-900">
            {formatGiftCodeForDisplay(code)}
          </code>
          <code className="block break-all rounded bg-ink-50 p-2 text-xs text-ink-600">{redeemUrl}</code>
        </>
      )}
    </Card>
  );
}
