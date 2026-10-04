'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { completeOrganisationSignupAction, type ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';
import { LegalAgreementCheckbox } from '@/components/auth/LegalAgreementCheckbox';

export function CompleteOrganisationForm({
  locale,
  defaultFullName,
  referralCode,
}: {
  locale: string;
  defaultFullName: string;
  referralCode?: string;
}) {
  const t = useTranslations('auth.signUp');
  const tComplete = useTranslations('auth.completeOrganisation');
  const router = useRouter();
  const action = completeOrganisationSignupAction.bind(null, locale);
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
      <TextField name="orgName" label={t('orgName')} hint={t('orgNameHint')} required autoFocus />
      <TextField name="fullName" label={t('fullName')} defaultValue={defaultFullName} required />
      <LegalAgreementCheckbox locale={locale} />
      {state?.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <SubmitButton size="lg">{tComplete('submit')}</SubmitButton>
    </form>
  );
}
