'use client';

import { useFormState } from 'react-dom';
import { useTranslations } from 'next-intl';
import { regeneratePageAction } from '@/lib/actions/stories';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';

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
  const action = regeneratePageAction.bind(null, locale, storyId, pageId);
  const [state, formAction] = useFormState<ActionResult, FormData>(async () => action(), {});

  return (
    <form action={formAction}>
      <Button type="submit" size="sm" variant="secondary">
        {t('regeneratePage')}
      </Button>
      {state.error && <p className="mt-1 text-xs text-coral-600">{state.error}</p>}
    </form>
  );
}
