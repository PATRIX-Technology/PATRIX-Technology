'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import QRCode from 'qrcode';
import { requestConsentAction, withdrawConsentAction, type RequestConsentResult } from '@/lib/actions/children';
import type { ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { CountryPhoneField } from '@/components/auth/CountryPhoneField';
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
  const [parentPhone, setParentPhone] = useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const requestAction = requestConsentAction.bind(null, locale, childId);
  const [requestState, requestFormAction] = useFormState<RequestConsentResult, FormData>(
    useSafeFormReducer(async () => requestAction(includePhoto, parentPhone ?? '')),
    {},
  );

  const withdrawAction = withdrawConsentAction.bind(null, locale, childId);
  const [withdrawState, withdrawFormAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async () => withdrawAction()),
    {},
  );

  useEffect(() => {
    if (requestState?.consentUrl) {
      QRCode.toDataURL(requestState.consentUrl, { margin: 1, width: 200 }).then(setQrDataUrl);
    }
  }, [requestState?.consentUrl]);

  useEffect(() => {
    // Feature-detect actual file-sharing support (not just text/url
    // sharing) with a throwaway probe file — Safari/Chrome on desktop
    // commonly have navigator.share but refuse files.
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return;
    try {
      const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
      setCanShareFiles(navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
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

  // Synchronous data-URL -> File decode (no fetch/await) so this can run
  // directly inside the click handler below with no gap before
  // navigator.share(). Mobile Chrome/Safari require share() to be called
  // within an unbroken chain of "user activation" from the click; an
  // intervening await (the previous implementation used fetch(qrDataUrl)
  // to get a Blob) breaks that chain, so share() throws
  // NotAllowedError -- silently swallowed by the catch below, which is
  // what made the button appear to just do nothing on a real phone.
  function qrDataUrlToFile(dataUrl: string): File {
    const [header, base64] = dataUrl.split(',');
    const mime = /data:(.*);base64/.exec(header ?? '')?.[1] ?? 'image/png';
    const binary = atob(base64 ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], 'ownly-consent-qr.png', { type: mime });
  }

  // Shares the QR code image itself (e.g. into WhatsApp as an attachment)
  // rather than the link as text — wa.me and mailto: links can only ever
  // carry text, so sending the actual PNG requires the OS share sheet.
  async function handleShareQr() {
    if (!qrDataUrl) return;
    const file = qrDataUrlToFile(qrDataUrl);
    try {
      await navigator.share({ files: [file], text: shareText });
    } catch (error) {
      // AbortError (and Safari/old Chrome's "cancelled" string error) is
      // just the user dismissing the share sheet -- not a failure.
      if (error instanceof Error && error.name === 'AbortError') return;
      showToast({ title: t('shareQrFailed'), description: t('shareDownloadQr'), tone: 'error' });
    }
  }

  function handleDownloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'ownly-consent-qr.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          {includePhoto && (
            <div className="max-w-xs">
              <CountryPhoneField label={t('parentPhoneLabel')} onChange={setParentPhone} />
              <p className="mt-1 text-xs text-ink-500">{t('parentPhoneHelp')}</p>
            </div>
          )}
          <SubmitButton variant="secondary" className="self-start" disabled={includePhoto && !parentPhone}>
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
            {canShareFiles && (
              <Button type="button" variant="primary" size="sm" onClick={handleShareQr}>
                <span aria-hidden>💬</span> {t('shareQr')}
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={handleDownloadQr}>
              {t('shareDownloadQr')}
            </Button>
            <a
              href={`mailto:?subject=${encodeURIComponent(t('shareEmailSubject'))}&body=${encodeURIComponent(shareText)}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-200"
            >
              <span aria-hidden>✉️</span>
              {t('shareEmail')}
            </a>
            <Button type="button" variant="secondary" size="sm" onClick={handleCopyLink}>
              {t('shareCopy')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
