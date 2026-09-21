'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function MfaChallengeForm({ locale }: { locale: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const factor = factors.totp[0];
      if (!factor) throw new Error('No authenticator app is enrolled for this account.');

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      router.push(`/${locale}/owner`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-2 font-display text-xl text-ink-900">Verify your identity</h1>
      <p className="mb-6 text-sm text-ink-600">Enter the 6-digit code from your authenticator app.</p>
      <form onSubmit={verify} className="flex flex-col gap-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="focus-ring rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-center text-lg tracking-widest"
        />
        {error && <p className="text-sm text-coral-600">{error}</p>}
        <Button type="submit" isLoading={isSubmitting}>
          Verify
        </Button>
      </form>
    </Card>
  );
}
