'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { regeneratePageAction } from '@/lib/actions/stories';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function RegeneratePageButton({
  locale,
  storyId,
  pageId,
}: {
  locale: string;
  storyId: string;
  pageId: string;
}) {
  const t = useTranslations('stories');
  const showToast = useToast();
  const action = regeneratePageAction.bind(null, locale, storyId, pageId);
  const [state, formAction] = useFormState<ActionResult, FormData>(async () => action(), {});
  const submitCount = useRef(0);

  useEffect(() => {
    if (submitCount.current === 0) return;
    if (state.error) {
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

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitCount.current += 1;
      }}
    >
      <Button type="submit" size="sm" variant="secondary">
        {t('regeneratePage')}
      </Button>
    </form>
  );
}
