'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  sendNurserySignUpOtpAction,
  verifyNurserySignUpOtpAction,
  type ActionResult,
} from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { CountryPhoneField } from '@/components/auth/CountryPhoneField';

export function PhoneNurserySignUpForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.phone');
  const tSignUp = useTranslations('auth.signUp');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [orgName, setOrgName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState<string | null>(null);

  const [sendState, sendFormAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    const result = await sendNurserySignUpOtpAction(formData);
    if (!result.error) setStep('code');
    return result;
  }, {});

  const verifyWithLocale = verifyNurserySignUpOtpAction.bind(null, locale);
  const [verifyState, verifyFormAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return verifyWithLocale(formData);
  }, {});

  if (step === 'details') {
    return (
      <form action={sendFormAction} className="flex flex-col gap-4">
        <TextField
          name="orgName"
          label={tSignUp('orgName')}
          hint={tSignUp('orgNameHint')}
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          required
        />
        <TextField
          name="fullName"
          label={tSignUp('fullName')}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
        />
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
      <input type="hidden" name="orgName" value={orgName} />
      <input type="hidden" name="fullName" value={fullName} />
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
        onClick={() => setStep('details')}
        className="self-start text-sm text-ink-500 underline"
      >
        {t('changeNumber')}
      </button>
    </form>
  );
}
