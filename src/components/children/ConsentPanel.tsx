'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import QRCode from 'qrcode';
import { requestConsentAction, withdrawConsentAction, type RequestConsentResult } from '@/lib/actions/children';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
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
}: {
  locale: string;
  childId: string;
  consentStatus: ConsentStatus;
}) {
  const t = useTranslations('consent');
  const tChildren = useTranslations('children');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const requestAction = requestConsentAction.bind(null, locale, childId);
  const [requestState, requestFormAction] = useFormState<RequestConsentResult, FormData>(
    async () => requestAction(),
    {},
  );

  const withdrawAction = withdrawConsentAction.bind(null, locale, childId);
  const [withdrawState, withdrawFormAction] = useFormState<ActionResult, FormData>(
    async () => withdrawAction(),
    {},
  );

  useEffect(() => {
    if (requestState.consentUrl) {
      QRCode.toDataURL(requestState.consentUrl, { margin: 1, width: 200 }).then(setQrDataUrl);
    }
  }, [requestState.consentUrl]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge tone={TONE[consentStatus]}>{tChildren(`consentStatus.${consentStatus}`)}</Badge>
      </div>

      <div className="flex flex-wrap gap-3">
        <form action={requestFormAction}>
          <Button type="submit" variant="secondary">
            {t('sendLink')}
          </Button>
        </form>
        {consentStatus === 'granted' && (
          <form
            action={withdrawFormAction}
            onSubmit={(event) => {
              if (!confirm(t('withdrawConfirm'))) event.preventDefault();
            }}
          >
            <Button type="submit" variant="danger">
              {t('withdraw')}
            </Button>
          </form>
        )}
      </div>

      {requestState.error && <p className="text-sm text-coral-600">{requestState.error}</p>}
      {withdrawState.error && <p className="text-sm text-coral-600">{withdrawState.error}</p>}

      {requestState.consentUrl && (
        <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <p className="mb-2 text-sm font-medium text-ink-700">
            Share this link or QR code with the parent:
          </p>
          <code className="block break-all rounded bg-ink-50 p-2 text-xs">{requestState.consentUrl}</code>
          {qrDataUrl && <img src={qrDataUrl} alt="Consent QR code" className="mt-3 h-40 w-40" />}
        </div>
      )}
    </div>
  );
}
