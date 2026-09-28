'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { changePasswordAction } from '@/lib/actions/auth';
import type { ActionResult } from '@/lib/actions/auth';
import { PASSWORD_MIN_LENGTH, PASSWORD_PATTERN, PASSWORD_REQUIREMENT_HINT } from '@/lib/domain/password';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

/** Only rendered for an account with an email/password identity (see
 * hasPasswordIdentity in changePasswordAction) — a phone-only account
 * has no password to change, so the settings page doesn't show this at
 * all for one rather than showing a form that will always error. */
export function ChangePasswordForm() {
  const showToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const submitCount = useRef(0);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return changePasswordAction(formData);
  }, {});

  useEffect(() => {
    if (submitCount.current === 0) return;
    if (state?.error) {
      showToast({ title: 'Could not update password', description: state.error, tone: 'error' });
    } else if (state?.message) {
      showToast({ title: 'Password updated', description: state.message, tone: 'success' });
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
      <TextField name="currentPassword" type="password" label="Current password" required autoComplete="current-password" />
      <TextField
        name="newPassword"
        type="password"
        label="New password"
        hint={PASSWORD_REQUIREMENT_HINT}
        required
        minLength={PASSWORD_MIN_LENGTH}
        pattern={PASSWORD_PATTERN}
        title={PASSWORD_REQUIREMENT_HINT}
        autoComplete="new-password"
      />
      <Button type="submit" className="self-start">
        Update password
      </Button>
    </form>
  );
}
