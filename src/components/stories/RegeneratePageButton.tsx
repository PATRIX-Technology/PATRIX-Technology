'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { regeneratePageAction } from '@/lib/actions/stories';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function RegeneratePageButton({
  locale,
  storyId,
  pageId,
  remaining,
}: {
  locale: string;
  storyId: string;
  pageId: string;
  /** How many manual regenerations this page has left before hitting
   * MAX_MANUAL_REGENERATIONS_PER_PAGE (src/lib/domain/stories.ts) — shown
   * so the limit isn't a surprise, and used to disable the button up
   * front rather than only after a failed submit. The server action
   * enforces the real limit either way. */
  remaining: number;
}) {
  const t = useTranslations('stories');
  const showToast = useToast();
  const action = regeneratePageAction.bind(null, locale, storyId, pageId);
  const [state, formAction] = useFormState<ActionResult, FormData>(async () => action(), {});
  const submitCount = useRef(0);

  useEffect(() => {
    if (submitCount.current === 0) return;
    if (state?.error) {
      showToast({
        title: t('regenerateFailedTitle'),
        description: state.error,
        tone: 'error',
      });
    } else {
      showToast({
        title: t('regenerateStartedTitle'),
        description: t('regenerateStartedBody'),
        tone: 'success',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (remaining <= 0) {
    return <p className="text-xs text-ink-400">{t('regenerationLimitReached')}</p>;
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitCount.current += 1;
      }}
    >
      <RegenerateSubmitButton label={t('regeneratePage')} remaining={remaining} />
    </form>
  );
}

/** useFormStatus only reports the status of the nearest ancestor <form>,
 * so this has to be nested inside it — disabling while pending is a
 * quick client-side guard against an accidental double-click; the real
 * limit is the server-side rate check in regeneratePageAction. */
function RegenerateSubmitButton({ label, remaining }: { label: string; remaining: number }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="secondary" disabled={pending} isLoading={pending}>
        {label}
      </Button>
      <span className="text-xs text-ink-400">{remaining} left</span>
    </div>
  );
}
