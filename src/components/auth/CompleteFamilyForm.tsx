'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { completeFamilySignupAction } from '@/lib/actions/family';
import type { ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LegalAgreementCheckbox } from '@/components/auth/LegalAgreementCheckbox';

export function CompleteFamilyForm({
  locale,
  fullName,
  referralCode,
}: {
  locale: string;
  fullName: string;
  referralCode?: string;
}) {
  const tComplete = useTranslations('auth.completeFamily');
  const router = useRouter();
  const action = completeFamilySignupAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => action(formData)),
    {},
  );

  useEffect(() => {
    if (state?.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="fullName" value={fullName} />
      <input type="hidden" name="referralCode" value={referralCode ?? ''} />
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
