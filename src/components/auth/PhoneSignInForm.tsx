'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { sendSignInOtpAction, verifySignInOtpAction, type ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { CountryPhoneField } from '@/components/auth/CountryPhoneField';

export function PhoneSignInForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.phone');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState<string | null>(null);

  const [sendState, sendFormAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    const result = await sendSignInOtpAction(formData);
    if (!result.error) setStep('code');
    return result;
  }, {});

  const verifyWithLocale = verifySignInOtpAction.bind(null, locale);
  const [verifyState, verifyFormAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return verifyWithLocale(formData);
  }, {});

  if (step === 'phone') {
    return (
      <form action={sendFormAction} className="flex flex-col gap-4">
        <CountryPhoneField label={t('phoneLabel')} onChange={setPhone} />
        <input type="hidden" name="phone" value={phone ?? ''} />
        {sendState.error && (
          <p role="alert" className="text-sm text-coral-600">
            {sendState.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!phone}>
          {t('sendCode')}
        </Button>
      </form>
    );
  }

  return (
    <form action={verifyFormAction} className="flex flex-col gap-4">
      <input type="hidden" name="phone" value={phone ?? ''} />
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
      {verifyState.error && (
        <p role="alert" className="text-sm text-coral-600">
          {verifyState.error}
        </p>
      )}
      <Button type="submit" size="lg">
        {t('verify')}
      </Button>
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
