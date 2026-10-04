'use client';

import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { submitDemoRequestAction } from '@/lib/actions/demo-request';
import type { ActionResult } from '@/lib/actions/auth';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { whatsappLink } from '@/lib/config/contact';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TextField } from '@/components/ui/Input';

export function DemoRequestForm({ locale }: { locale: string }) {
  const t = useTranslations('marketing.demoRequest');
  const action = submitDemoRequestAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => action(formData)),
    {},
  );

  const waLink = whatsappLink(t('whatsappMessage'));

  if (state?.message) {
    return (
      <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6 text-center">
        <p className="font-display text-lg text-ink-900">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label={t('name')} required />
          <TextField name="email" type="email" label={t('email')} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="phone" type="tel" label={t('phone')} />
          <TextField name="organisationName" label={t('organisationName')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="demo-request-message" className="text-sm font-medium text-ink-700">
            {t('message')}
          </label>
          <textarea
            id="demo-request-message"
            name="message"
            rows={3}
            className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-ink-900 placeholder:text-ink-400"
          />
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-coral-600">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <SubmitButton size="lg">{t('submit')}</SubmitButton>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer" className="text-sm font-medium text-lagoon-600">
              {t('whatsappCta')}
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
