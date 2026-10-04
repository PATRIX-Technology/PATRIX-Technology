'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { sendSignInOtpAction, verifySignInOtpAction, type ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';
import { CountryPhoneField } from '@/components/auth/CountryPhoneField';

export function PhoneSignInForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.phone');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  const [sendState, sendFormAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => {
      const result = await sendSignInOtpAction(formData);
      if (result && !result.error) setStep('code');
      return result;
    }),
    {},
  );

  const verifyWithLocale = verifySignInOtpAction.bind(null, locale);
  const [verifyState, verifyFormAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => verifyWithLocale(formData)),
    {},
  );

  useEffect(() => {
    if (verifyState?.redirectTo) router.push(verifyState.redirectTo);
  }, [verifyState, router]);

  if (step === 'phone') {
    return (
      <form action={sendFormAction} className="flex flex-col gap-4">
        <CountryPhoneField label={t('phoneLabel')} onChange={setPhone} />
        <input type="hidden" name="phone" value={phone ?? ''} />
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="focus-ring h-4 w-4 rounded border-[rgb(var(--color-border))]"
          />
          {tAuth('rememberMe')}
        </label>
        {sendState?.error && (
          <p role="alert" className="text-sm text-coral-600">
            {sendState.error}
          </p>
        )}
        <SubmitButton size="lg" disabled={!phone}>
          {t('sendCode')}
        </SubmitButton>
      </form>
    );
  }

  return (
    <form action={verifyFormAction} className="flex flex-col gap-4">
      <input type="hidden" name="phone" value={phone ?? ''} />
      <input type="hidden" name="rememberMe" value={rememberMe ? 'true' : 'false'} />
      <p className="text-sm text-ink-600">{t('codeSentTo', { phone: phone ?? '' })}</p>
      <TextField
        name="token"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        autoComplete="one-time-code"
        label={t('codeLabel')}
        autoFocus
        required
      />
      {verifyState?.error && (
        <p role="alert" className="text-sm text-coral-600">
          {verifyState.error}
        </p>
      )}
      <SubmitButton size="lg">{t('verify')}</SubmitButton>
      <button
        type="button"
        onClick={() => setStep('phone')}
        className="self-start text-sm text-ink-500 underline"
      >
        {t('changeNumber')}
      </button>
    </form>
  );
}
