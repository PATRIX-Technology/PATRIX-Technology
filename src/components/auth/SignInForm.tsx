'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signInAction, type ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';

export function SignInForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.signIn');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const action = signInAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => action(formData)),
    {},
  );

  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField name="email" type="email" label={t('email')} required />
      <TextField name="password" type="password" label={t('password')} required />
      <label className="flex items-center gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          name="rememberMe"
          value="true"
          defaultChecked
          className="focus-ring h-4 w-4 rounded border-[rgb(var(--color-border))]"
        />
        {tAuth('rememberMe')}
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
    </form>
  );
}
