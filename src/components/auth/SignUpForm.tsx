'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signUpAction, type ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations('auth.signUp');
  const router = useRouter();
  const action = signUpAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField name="orgName" label={t('orgName')} hint={t('orgNameHint')} required />
      <TextField name="fullName" label={t('fullName')} required />
      <TextField name="email" type="email" label={t('email')} required />
      <TextField name="password" type="password" label={t('password')} required minLength={8} />
      {state.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg">
        {t('submit')}
      </Button>
    </form>
  );
}
