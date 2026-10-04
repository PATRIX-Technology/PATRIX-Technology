'use client';

import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { requestPasswordResetAction, type ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.forgotPassword');
  const action = requestPasswordResetAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => action(formData)),
    {},
  );

  if (state?.message) {
    return <p className="text-sm text-ink-700">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField name="email" type="email" label={t('email')} required autoFocus />
      {state?.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
    </form>
  );
}
