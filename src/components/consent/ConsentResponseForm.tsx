'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  respondToConsentAction,
  sendConsentOtpAction,
  verifyConsentOtpAction,
  type RespondToConsentResult,
  type VerifyConsentOtpResult,
} from '@/lib/actions/consent-public';
import type { ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * A photo-scoped consent request can't be granted or declined until the
 * phone on file has been verified via SMS code (migration 0036, enforced
 * in respond_to_consent — this UI gate is a convenience, not the security
 * boundary). Non-photo requests never set otpRequired, so this step
 * never appears for them.
 */
export function ConsentResponseForm({
  token,
  otpRequired,
  otpVerified,
  parentPhoneMasked,
}: {
  token: string;
  otpRequired: boolean;
  otpVerified: boolean;
  parentPhoneMasked?: string;
}) {
  const t = useTranslations('consent');
  const [verified, setVerified] = useState(otpVerified);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');

  const sendOtpAction = sendConsentOtpAction.bind(null, token);
  const [sendState, sendFormAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async () => {
      const result = await sendOtpAction();
      if (!result.error) setCodeSent(true);
      return result;
    }),
    {},
  );

  const verifyOtpAction = verifyConsentOtpAction.bind(null, token);
  const [verifyState, verifyFormAction] = useFormState<VerifyConsentOtpResult, FormData>(
    useSafeFormReducer(async () => {
      const result = await verifyOtpAction(code);
      if (result.success) setVerified(true);
      return result;
    }),
    {},
  );

  const grantAction = respondToConsentAction.bind(null, token, 'granted');
  const [grantState, grantFormAction] = useFormState<RespondToConsentResult, FormData>(
    useSafeFormReducer(async () => grantAction()),
    {},
  );

  const declineAction = respondToConsentAction.bind(null, token, 'declined');
  const [declineState, declineFormAction] = useFormState<RespondToConsentResult, FormData>(
    useSafeFormReducer(async () => declineAction()),
    {},
  );

  if (grantState.success) {
    return <p className="text-lagoon-300">{t('granted')}</p>;
  }
  if (declineState.success) {
    return <p className="text-ink-600">{t('declined')}</p>;
  }

  if (otpRequired && !verified) {
    return (
      <div className="flex flex-col gap-4 text-start">
        <p className="text-sm text-ink-600">
          {codeSent
            ? t('otpCodeSentTo', { phone: parentPhoneMasked ?? '' })
            : t('otpExplain', { phone: parentPhoneMasked ?? '' })}
        </p>
        {!codeSent ? (
          <form action={sendFormAction}>
            <SubmitButton size="lg">{t('otpSendButton')}</SubmitButton>
          </form>
        ) : (
          <form action={verifyFormAction} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('otpCodePlaceholder')}
              className="focus-ring w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-center text-lg tracking-widest text-ink-900"
            />
            <div className="flex gap-3">
              <SubmitButton size="lg" disabled={!code}>
                {t('otpVerifyButton')}
              </SubmitButton>
              <button
                type="button"
                className="text-sm text-ink-500 underline"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                }}
              >
                {t('otpResend')}
              </button>
            </div>
          </form>
        )}
        {sendState?.error && <p className="text-sm text-coral-600">{sendState.error}</p>}
        {verifyState?.error && <p className="text-sm text-coral-600">{verifyState.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <form action={grantFormAction}>
          <SubmitButton size="lg">{t('grant')}</SubmitButton>
        </form>
        <form action={declineFormAction}>
          <SubmitButton size="lg" variant="secondary">
            {t('decline')}
          </SubmitButton>
        </form>
      </div>
      {grantState?.error && <p className="text-sm text-coral-600">{grantState.error}</p>}
      {declineState?.error && <p className="text-sm text-coral-600">{declineState.error}</p>}
    </div>
  );
}
