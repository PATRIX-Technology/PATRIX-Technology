'use client';

import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { respondToConsentAction, type RespondToConsentResult } from '@/lib/actions/consent-public';
import { Button } from '@/components/ui/Button';

export function ConsentResponseForm({ token }: { token: string }) {
  const t = useTranslations('consent');

  const grantAction = respondToConsentAction.bind(null, token, 'granted');
  const [grantState, grantFormAction] = useFormState<RespondToConsentResult, FormData>(
    async () => grantAction(),
    {},
  );

  const declineAction = respondToConsentAction.bind(null, token, 'declined');
  const [declineState, declineFormAction] = useFormState<RespondToConsentResult, FormData>(
    async () => declineAction(),
    {},
  );

  if (grantState.success) {
    return <p className="text-lagoon-700">{t('granted')}</p>;
  }
  if (declineState.success) {
    return <p className="text-ink-600">{t('declined')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <form action={grantFormAction}>
          <Button type="submit" size="lg">
            {t('grant')}
          </Button>
        </form>
        <form action={declineFormAction}>
          <Button type="submit" size="lg" variant="secondary">
            {t('decline')}
          </Button>
        </form>
      </div>
      {grantState?.error && <p className="text-sm text-coral-600">{grantState.error}</p>}
      {declineState?.error && <p className="text-sm text-coral-600">{declineState.error}</p>}
    </div>
  );
}
