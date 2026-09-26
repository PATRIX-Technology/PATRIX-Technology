'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import { approveStoryAction, rejectStoryAction } from '@/lib/actions/stories';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';

export function ApprovalActions({
  locale,
  storyId,
  canApprove,
}: {
  locale: string;
  storyId: string;
  canApprove: boolean;
}) {
  const t = useTranslations('stories');
  const [showReject, setShowReject] = useState(false);

  const approveAction = approveStoryAction.bind(null, locale, storyId);
  const [approveState, approveFormAction] = useFormState<ActionResult, FormData>(
    async () => approveAction(),
    {},
  );

  const [rejectState, rejectFormAction] = useFormState<ActionResult, FormData>(
    async (_prev, formData) => {
      const reason = String(formData.get('reason') ?? '');
      return rejectStoryAction(locale, storyId, reason);
    },
    {},
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <form action={approveFormAction}>
          <Button type="submit" disabled={!canApprove}>
            {t('approve')}
          </Button>
        </form>
        <Button variant="danger" onClick={() => setShowReject((v) => !v)}>
          {t('reject')}
        </Button>
      </div>
      {!canApprove && (
        <p className="text-xs text-ink-500">Every page must finish generating before this story can be approved.</p>
      )}
      {approveState?.error && <p className="text-sm text-coral-600">{approveState.error}</p>}
      {showReject && (
        <form action={rejectFormAction} className="flex gap-2">
          <input
            name="reason"
            placeholder="Reason for rejection"
            required
            className="focus-ring flex-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm"
          />
          <Button type="submit" variant="danger">
            Confirm reject
          </Button>
        </form>
      )}
      {rejectState?.error && <p className="text-sm text-coral-600">{rejectState.error}</p>}
    </div>
  );
}
