'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import { addChildAction } from '@/lib/actions/children';
import type { ActionResult } from '@/lib/actions/auth';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { AvatarPicker } from './AvatarPicker';
import { DEFAULT_AVATAR_CONFIG, type AvatarConfig } from '@/lib/domain/avatar';

export function AddChildDialog({ locale }: { locale: string }) {
  const t = useTranslations('children');
  const tForm = useTranslations('children.form');
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const action = addChildAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    const result = await action(formData);
    if (!result.error) setOpen(false);
    return result;
  }, {});

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('add')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('add')}>
        <form action={formAction} className="flex flex-col gap-4">
          <TextField name="firstName" label={tForm('firstName')} required maxLength={60} />
          <div>
            <label htmlFor="pronoun" className="mb-1.5 block text-sm font-medium text-ink-700">
              {tForm('pronoun')}
            </label>
            <select
              id="pronoun"
              name="pronoun"
              defaultValue="they"
              className="focus-ring w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
            >
              <option value="she">{tForm('pronounOptions.she')}</option>
              <option value="he">{tForm('pronounOptions.he')}</option>
              <option value="they">{tForm('pronounOptions.they')}</option>
            </select>
          </div>
          <TextField name="className" label={tForm('class')} />
          <div>
            <label htmlFor="preferredLanguage" className="mb-1.5 block text-sm font-medium text-ink-700">
              {tForm('language')}
            </label>
            <select
              id="preferredLanguage"
              name="preferredLanguage"
              defaultValue="en"
              className="focus-ring w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <AvatarPicker value={avatar} onChange={setAvatar} />
          {state.error && (
            <p role="alert" className="text-sm text-coral-600">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {tForm('cancel')}
            </Button>
            <Button type="submit">{tForm('save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
