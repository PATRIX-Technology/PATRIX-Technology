'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { removeTenantLogoAction, uploadTenantLogoAction } from '@/lib/actions/tenant';
import type { ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function LogoUpload({
  locale,
  hasLogo,
  logoUrl,
}: {
  locale: string;
  hasLogo: boolean;
  logoUrl: string | null;
}) {
  const t = useTranslations('dashboard.settings');
  const uploadAction = uploadTenantLogoAction.bind(null, locale);
  const [uploadState, uploadFormAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => uploadAction(formData)),
    {},
  );
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleRemove() {
    setIsRemoving(true);
    await removeTenantLogoAction(locale);
    setIsRemoving(false);
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-700">{t('logoLabel')}</label>
      <p className="mb-2 text-sm text-ink-600">{t('logoHint')}</p>
      {hasLogo ? (
        <div className="flex items-center gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={t('logoAlt')} className="h-16 w-16 rounded-xl2 border border-[rgb(var(--color-border))] object-contain bg-white p-1" />
          )}
          <Button variant="danger" size="sm" onClick={handleRemove} isLoading={isRemoving}>
            {t('removeLogo')}
          </Button>
        </div>
      ) : (
        <form action={uploadFormAction} className="flex flex-col gap-3">
          <input
            type="file"
            name="logo"
            accept="image/jpeg,image/png,image/webp"
            required
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] p-2 text-sm"
          />
          {uploadState?.error && <p className="text-sm text-coral-600">{uploadState.error}</p>}
          <SubmitButton size="sm" className="self-start">
            {t('uploadLogo')}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
