'use client';

import { useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { removeChildPhotoAction, uploadChildPhotoAction } from '@/lib/actions/children';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';

export function PhotoUpload({
  locale,
  childId,
  hasPhoto,
  photoUrl,
}: {
  locale: string;
  childId: string;
  hasPhoto: boolean;
  photoUrl: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadFormAction] = useFormState<ActionResult, FormData>(
    async (_prev, formData) => uploadChildPhotoAction(locale, formData),
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
          <img src={photoUrl} alt="Reference photo" className="h-20 w-20 rounded-xl2 object-cover" />
        )}
        <Button variant="danger" size="sm" onClick={handleRemove} isLoading={isRemoving}>
          Remove photo
        </Button>
      </div>
    );
  }

  return (
    <form action={uploadFormAction} className="flex flex-col gap-3">
      <input type="hidden" name="childId" value={childId} />
      <input
        ref={fileInputRef}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        required
        className="focus-ring rounded-lg border border-[rgb(var(--color-border))] p-2 text-sm"
      />
      {uploadState.error && <p className="text-sm text-coral-600">{uploadState.error}</p>}
      <Button type="submit" size="sm" className="self-start">
        Upload photo
      </Button>
    </form>
  );
}
