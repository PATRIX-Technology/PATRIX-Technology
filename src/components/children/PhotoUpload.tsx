'use client';

import { useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { removeChildPhotoAction, uploadChildPhotoAction } from '@/lib/actions/children';
import type { ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function PhotoUpload({
  locale,
  childId,
  hasPhoto,
  photoUrl,
  requireFamilyConsentCheckbox = false,
}: {
  locale: string;
  childId: string;
  hasPhoto: boolean;
  photoUrl: string | null;
  /** Family tenants have no separate multi-party consent flow to wait on
   * (the account owner IS the child's parent/guardian) — see
   * docs/DECISIONS.md "Family photo consent: a single checkbox at upload
   * time". When true, shows one required checkbox right above the file
   * input so granting consent and uploading happen in a single action,
   * instead of the nursery flow's separate request/wait/respond steps. */
  requireFamilyConsentCheckbox?: boolean;
}) {
  const t = useTranslations('children.photoUpload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadFormAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => uploadChildPhotoAction(locale, formData)),
    {},
  );
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleRemove() {
    setIsRemoving(true);
    await removeChildPhotoAction(locale, childId);
    setIsRemoving(false);
  }

  if (hasPhoto) {
    return (
      <div className="flex items-center gap-4">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={t('referencePhotoAlt')} className="h-20 w-20 rounded-xl2 object-cover" />
        )}
        <Button variant="danger" size="sm" onClick={handleRemove} isLoading={isRemoving}>
          {t('removePhoto')}
        </Button>
      </div>
    );
  }

  return (
    <form action={uploadFormAction} className="flex flex-col gap-3">
      <input type="hidden" name="childId" value={childId} />
      {requireFamilyConsentCheckbox && (
        <label className="flex items-start gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            name="familyPhotoConsent"
            required
            className="focus-ring mt-0.5 h-4 w-4 rounded border-[rgb(var(--color-border))]"
          />
          <span>{t('familyConsentText')}</span>
        </label>
      )}
      <input
        ref={fileInputRef}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        required
        className="focus-ring rounded-lg border border-[rgb(var(--color-border))] p-2 text-sm"
      />
      {uploadState?.error && <p className="text-sm text-coral-600">{uploadState.error}</p>}
      <SubmitButton size="sm" className="self-start">
        {t('uploadPhoto')}
      </SubmitButton>
    </form>
  );
}
