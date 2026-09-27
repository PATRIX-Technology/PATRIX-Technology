'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { acceptStaffInviteAction, type AcceptStaffInviteResult } from '@/lib/actions/staff-invites-public';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';

export function AcceptStaffInviteForm({
  locale,
  token,
  email,
}: {
  locale: string;
  token: string;
  email: string;
}) {
  const t = useTranslations('staffAccept');
  const router = useRouter();
  const action = acceptStaffInviteAction.bind(null, locale, token, email);
  const [state, formAction] = useFormState<AcceptStaffInviteResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  if (state?.emailConfirmationPending) {
    return <p className="text-sm text-ink-600">{t('emailConfirmationPending')}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField type="email" label={t('email')} value={email} disabled />
      <TextField name="fullName" label={t('fullName')} required />
      <TextField name="password" type="password" label={t('password')} required minLength={8} />
      {state?.error && (
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
