'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import QRCode from 'qrcode';
import { requestConsentAction, withdrawConsentAction, type RequestConsentResult } from '@/lib/actions/children';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { ConsentStatus } from '@/types/database';

const TONE: Record<ConsentStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  not_requested: 'neutral',
  pending: 'warning',
  granted: 'success',
  declined: 'danger',
  withdrawn: 'danger',
};

export function ConsentPanel({
  locale,
  childId,
  consentStatus,
  photoOptionAvailable = false,
}: {
  locale: string;
  childId: string;
  consentStatus: ConsentStatus;
  /** True only when FEATURE_PHOTO_PERSONALIZATION is on AND this tenant
   * has opted in — see the child detail page (server component) for
   * where this is actually decided. */
  photoOptionAvailable?: boolean;
}) {
  const t = useTranslations('consent');
  const tChildren = useTranslations('children');
  const showToast = useToast();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [includePhoto, setIncludePhoto] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const requestAction = requestConsentAction.bind(null, locale, childId);
  const [requestState, requestFormAction] = useFormState<RequestConsentResult, FormData>(
    async () => requestAction(includePhoto),
    {},
  );

  const withdrawAction = withdrawConsentAction.bind(null, locale, childId);
  const [withdrawState, withdrawFormAction] = useFormState<ActionResult, FormData>(
    async () => withdrawAction(),
    {},
  );

  useEffect(() => {
    if (requestState?.consentUrl) {
      QRCode.toDataURL(requestState.consentUrl, { margin: 1, width: 200 }).then(setQrDataUrl);
    }
  }, [requestState?.consentUrl]);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const shareText = requestState?.consentUrl ? `${t('shareMessageText')} ${requestState.consentUrl}` : '';

  async function handleCopyLink() {
    if (!requestState?.consentUrl) return;
    try {
      await navigator.clipboard.writeText(requestState.consentUrl);
      showToast({ title: t('shareCopied'), tone: 'success' });
    } catch {
      showToast({ title: t('shareCopied'), description: requestState.consentUrl, tone: 'info' });
    }
  }

  async function handleNativeShare() {
    if (!requestState?.consentUrl) return;
    try {
      await navigator.share({ text: shareText, url: requestState.consentUrl });
    } catch {
      // User cancelled the share sheet — nothing to do.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge tone={TONE[consentStatus]}>{tChildren(`consentStatus.${consentStatus}`)}</Badge>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <form action={requestFormAction} className="flex flex-col gap-2">
          {photoOptionAvailable && (
            <label className="flex items-center gap-2 text-sm text-ink-600">
              <input
                type="checkbox"
                checked={includePhoto}
                onChange={(e) => setIncludePhoto(e.target.checked)}
                className="h-4 w-4"
              />
              {t('photoConsentCheckboxLabel')}
            </label>
          )}
          <SubmitButton variant="secondary" className="self-start">
            {t('sendLink')}
          </SubmitButton>
        </form>
        {consentStatus === 'granted' && (
          <form
            action={withdrawFormAction}
            onSubmit={(event) => {
              if (!confirm(t('withdrawConfirm'))) event.preventDefault();
            }}
          >
            <SubmitButton variant="danger">{t('withdraw')}</SubmitButton>
          </form>
        )}
      </div>

      {requestState?.error && <p className="text-sm text-coral-600">{requestState.error}</p>}
      {withdrawState?.error && <p className="text-sm text-coral-600">{withdrawState.error}</p>}

      {requestState?.consentUrl && (
        <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <p className="mb-2 text-sm font-medium text-ink-700">
            {t('shareLinkPrompt')}
          </p>
          <code className="block break-all rounded bg-ink-50 p-2 text-xs">{requestState.consentUrl}</code>
          {qrDataUrl && <img src={qrDataUrl} alt={t('qrCodeAlt')} className="mt-3 h-40 w-40" />}
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-200"
            >
              <span aria-hidden>💬</span>
              {t('shareWhatsapp')}
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(t('shareEmailSubject'))}&body=${encodeURIComponent(shareText)}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-200"
            >
              <span aria-hidden>✉️</span>
              {t('shareEmail')}
            </a>
            {canNativeShare && (
              <Button type="button" variant="secondary" size="sm" onClick={handleNativeShare}>
                {t('shareNative')}
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={handleCopyLink}>
              {t('shareCopy')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
