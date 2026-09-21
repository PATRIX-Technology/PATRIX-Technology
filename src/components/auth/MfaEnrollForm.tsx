'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { markMfaEnrolledAction } from '@/lib/actions/mfa';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type Step = 'start' | 'scan' | 'error';

export function MfaEnrollForm({ locale }: { locale: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [step, setStep] = useState<Step>('start');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function startEnrollment() {
    setError(null);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (enrollError) {
      setError(enrollError.message);
      setStep('error');
      return;
    }
    setQrCode(data.totp.qr_code);
    setFactorId(data.id);
    setStep('scan');
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      await markMfaEnrolledAction();
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
      <h1 className="mb-2 font-display text-xl text-ink-900">Set up two-factor authentication</h1>
      <p className="mb-6 text-sm text-ink-600">
        Platform owner accounts require an authenticator app (Google Authenticator, 1Password, Authy,
        etc.) before accessing the owner dashboard.
      </p>

      {step === 'start' && <Button onClick={startEnrollment}>Start setup</Button>}

      {step === 'scan' && qrCode && (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="h-48 w-48 self-center" />
          <label htmlFor="mfa-code" className="text-sm font-medium text-ink-700">
            Enter the 6-digit code from your app
          </label>
          <input
            id="mfa-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-center text-lg tracking-widest"
          />
          {error && <p className="text-sm text-coral-600">{error}</p>}
          <Button type="submit" isLoading={isSubmitting}>
            Verify and enable
          </Button>
        </form>
      )}

      {step === 'error' && error && <p className="text-sm text-coral-600">{error}</p>}
    </Card>
  );
}
