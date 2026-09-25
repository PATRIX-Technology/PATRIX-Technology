'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import { AvatarPicker } from './AvatarPicker';
import { DEFAULT_AVATAR_CONFIG, type AvatarConfig } from '@/lib/domain/avatar';
import type { Pronoun, AppLocale } from '@/types/database';

export interface ChildFormDefaults {
  firstName?: string;
  lastName?: string | null;
  arabicFirstName?: string | null;
  arabicLastName?: string | null;
  pronoun?: Pronoun;
  className?: string | null;
  preferredLanguage?: AppLocale;
  avatarConfig?: AvatarConfig;
}

/**
 * Shared name/pronoun/class/language/avatar fields for both adding and
 * editing a child — see AddChildDialog and EditChildDialog. Kept as one
 * component so the two forms can never quietly drift apart.
 */
export function ChildForm({
  action,
  defaultValues,
  submitLabel,
  onCancel,
  onSuccess,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues?: ChildFormDefaults;
  submitLabel: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const tForm = useTranslations('children.form');
  const [avatar, setAvatar] = useState<AvatarConfig>(defaultValues?.avatarConfig ?? DEFAULT_AVATAR_CONFIG);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    const result = await action(formData);
    if (!result.error) onSuccess();
    return result;
  }, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        name="firstName"
        label={tForm('firstName')}
        required
        maxLength={60}
        defaultValue={defaultValues?.firstName}
      />
      <TextField
        name="lastName"
        label={tForm('lastName')}
        maxLength={60}
        defaultValue={defaultValues?.lastName ?? ''}
      />
      <TextField
        name="arabicFirstName"
        label={tForm('arabicFirstName')}
        hint={tForm('arabicFirstNameHint')}
        dir="rtl"
        maxLength={60}
        defaultValue={defaultValues?.arabicFirstName ?? ''}
      />
      <TextField
        name="arabicLastName"
        label={tForm('arabicLastName')}
        dir="rtl"
        maxLength={60}
        defaultValue={defaultValues?.arabicLastName ?? ''}
      />
      <div>
        <label htmlFor="pronoun" className="mb-1.5 block text-sm font-medium text-ink-700">
          {tForm('pronoun')}
        </label>
        <select
          id="pronoun"
          name="pronoun"
          defaultValue={defaultValues?.pronoun ?? 'they'}
          className="focus-ring w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
        >
          <option value="she">{tForm('pronounOptions.she')}</option>
          <option value="he">{tForm('pronounOptions.he')}</option>
          <option value="they">{tForm('pronounOptions.they')}</option>
        </select>
      </div>
      <TextField name="className" label={tForm('class')} defaultValue={defaultValues?.className ?? ''} />
      <div>
        <label htmlFor="preferredLanguage" className="mb-1.5 block text-sm font-medium text-ink-700">
          {tForm('language')}
        </label>
        <select
          id="preferredLanguage"
          name="preferredLanguage"
          defaultValue={defaultValues?.preferredLanguage ?? 'en'}
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
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tForm('cancel')}
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
