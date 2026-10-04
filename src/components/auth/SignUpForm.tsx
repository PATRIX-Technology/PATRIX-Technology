'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signUpAction, type ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '@/lib/domain/password';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';
import { LegalAgreementCheckbox } from '@/components/auth/LegalAgreementCheckbox';

export function SignUpForm({ locale, referralCode }: { locale: string; referralCode?: string }) {
  const t = useTranslations('auth.signUp');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const action = signUpAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => action(formData)),
    {},
  );

  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="referralCode" value={referralCode ?? ''} />
      <TextField name="orgName" label={t('orgName')} hint={t('orgNameHint')} required />
      <TextField name="fullName" label={t('fullName')} required />
      <TextField name="email" type="email" label={t('email')} required />
      <TextField
        name="password"
        type="password"
        label={t('password')}
        hint={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        required
        minLength={PASSWORD_MIN_LENGTH}
        pattern={PASSWORD_PATTERN}
        title={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
      />
      <LegalAgreementCheckbox locale={locale} />
      {state?.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
    </form>
  );
}
