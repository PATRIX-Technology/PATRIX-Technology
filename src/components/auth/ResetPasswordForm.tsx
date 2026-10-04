'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { resetPasswordAction, type ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '@/lib/domain/password';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';

export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.resetPassword');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const [state, formAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => resetPasswordAction(formData)),
    {},
  );

  useEffect(() => {
    if (state?.message) {
      const timeout = setTimeout(() => router.push(`/${locale}/sign-in`), 1500);
      return () => clearTimeout(timeout);
    }
  }, [state, router, locale]);

  if (state?.message) {
    return <p className="text-sm text-ink-700">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        name="newPassword"
        type="password"
        label={t('newPassword')}
        hint={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        required
        autoFocus
        minLength={PASSWORD_MIN_LENGTH}
        pattern={PASSWORD_PATTERN}
        title={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
      />
      {state?.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
    </form>
  );
}
