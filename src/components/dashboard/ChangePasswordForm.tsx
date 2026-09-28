'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { changePasswordAction } from '@/lib/actions/auth';
import type { ActionResult } from '@/lib/actions/auth';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN } from '@/lib/domain/password';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

/** Only rendered for an account with an email/password identity (see
 * hasPasswordIdentity in changePasswordAction) — a phone-only account
 * has no password to change, so the settings page doesn't show this at
 * all for one rather than showing a form that will always error. */
export function ChangePasswordForm() {
  const t = useTranslations('dashboard.changePassword');
  const tAuth = useTranslations('auth');
  const showToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submitCount = useRef(0);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return changePasswordAction(formData);
  }, {});

  useEffect(() => {
    if (submitCount.current === 0) return;
    if (state?.error) {
      showToast({ title: t('errorTitle'), description: state.error, tone: 'error' });
    } else if (state?.message) {
      showToast({ title: t('successTitle'), description: state.message, tone: 'success' });
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submitCount.current += 1;
      }}
      className="flex max-w-md flex-col gap-4"
    >
      <TextField
        name="currentPassword"
        type="password"
        label={t('currentPasswordLabel')}
        required
        autoComplete="current-password"
      />
      <TextField
        name="newPassword"
        type="password"
        label={t('newPasswordLabel')}
        hint={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        required
        minLength={PASSWORD_MIN_LENGTH}
        pattern={PASSWORD_PATTERN}
        title={tAuth('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
      />
      <Button type="submit" className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
