'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import { inviteStaffAction, type InviteStaffResult } from '@/lib/actions/tenant';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';

export function InviteStaffForm({ locale }: { locale: string }) {
  const t = useTranslations('staffPage');
  const [copied, setCopied] = useState(false);
  const action = inviteStaffAction.bind(null, locale);
  const [state, formAction] = useFormState<InviteStaffResult, FormData>(async (_prev, formData) => {
    setCopied(false);
    return action(formData);
  }, {});

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied -- the link is still shown as
      // selectable text below, so this failure needs no user-facing error.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <TextField name="email" type="email" label={t('inviteEmailLabel')} required className="min-w-[220px]" />
        <div>
          <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-ink-700">
            {t('inviteRoleLabel')}
          </label>
          <select
            id="role"
            name="role"
            defaultValue="nursery_staff"
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
          >
            <option value="nursery_admin">{t('roleAdminLabel')}</option>
            <option value="nursery_staff">{t('roleStaffLabel')}</option>
          </select>
        </div>
        <SubmitButton>{t('inviteSubmit')}</SubmitButton>
      </form>
      {state?.error && <p className="text-sm text-coral-600">{state.error}</p>}
      {state?.inviteUrl && (
        <div className="flex flex-col gap-2 rounded-lg bg-ink-50 p-3">
          <p className="text-sm text-ink-700">{t('inviteLinkReady')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-[rgb(var(--color-surface))] px-2 py-1 text-xs text-ink-800">
              {state.inviteUrl}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={() => handleCopy(state.inviteUrl!)}>
              {copied ? t('inviteLinkCopied') : t('inviteLinkCopy')}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${t('inviteWhatsappText')} ${state.inviteUrl}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" variant="secondary" size="sm">
                WhatsApp
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
