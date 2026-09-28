'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { markMfaEnrolledAction } from '@/lib/actions/mfa';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type Step = 'start' | 'scan' | 'error';

export function MfaEnrollForm({
  redirectTo,
  mandatory,
}: {
  /** Where to send the user once enrollment is verified — the owner
   * dashboard for the mandatory owner flow, the regular dashboard for
   * the optional one. See docs/DECISIONS.md "Optional-but-recommended
   * MFA for regular users". */
  redirectTo: string;
  /** Swaps only the description between the "this is required" (owner)
   * and "this is recommended" (regular user) framing — both are proper
   * translation keys, not hardcoded English, unlike the props this
   * replaced. See docs/DECISIONS.md "Dashboard settings/billing/
   * security/MFA screens translated into Arabic". */
  mandatory?: boolean;
}) {
  const t = useTranslations('mfa.enroll');
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [step, setStep] = useState<Step>('start');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  async function startEnrollment() {
    setError(null);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (enrollError) {
      setError(enrollError.message);
      setStep('error');
      return;
    }
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setStep('scan');
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (older browsers, some app webviews) —
      // the secret is already shown as selectable text, so the user can
      // still select-and-copy it manually.
    }
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
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="mb-2 font-display text-xl text-ink-900">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-600">
        {mandatory ? t('descriptionMandatory') : t('descriptionRecommended')}
      </p>

      {step === 'start' && <Button onClick={startEnrollment}>{t('startSetup')}</Button>}

      {step === 'scan' && qrCode && (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="h-48 w-48 self-center" />
          <p className="text-center text-xs text-ink-500">{t('scanHint')}</p>

          {secret && (
            <div className="flex flex-col gap-2 rounded-lg border border-[rgb(var(--color-border))] p-3">
              <p className="text-xs text-ink-500">{t('cantScan')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all break-all rounded bg-[rgb(var(--color-surface))] px-2 py-1.5 text-sm tracking-wider text-ink-800">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="focus-ring shrink-0 rounded-lg border border-[rgb(var(--color-border))] px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
                >
                  {justCopied ? t('copied') : t('copyKey')}
                </button>
              </div>
            </div>
          )}

          <label htmlFor="mfa-code" className="text-sm font-medium text-ink-700">
            {t('codeLabel')}
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
            {t('verifyAndEnable')}
          </Button>
        </form>
      )}

      {step === 'error' && error && <p className="text-sm text-coral-600">{error}</p>}
    </Card>
  );
}
