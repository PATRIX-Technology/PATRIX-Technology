'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { createStoryAction } from '@/lib/actions/stories';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { ConsentStatus, NativeReviewStatus } from '@/types/database';

interface TemplateOption {
  id: string;
  theme_key: string;
  title: string;
  locale: string;
  native_review_status: NativeReviewStatus;
}

export function CreateStoryForm({
  locale,
  childId,
  consentStatus,
  templates,
}: {
  locale: string;
  childId: string;
  consentStatus: ConsentStatus;
  templates: TemplateOption[];
}) {
  const t = useTranslations('stories');
  const action = createStoryAction.bind(null, locale, childId);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  const usableTemplates = templates.filter((tpl) => tpl.native_review_status === 'reviewed');
  const consentGranted = consentStatus === 'granted';

  if (!consentGranted) {
    return (
      <p className="text-sm text-ink-500">
        A story cannot be created until this child&apos;s parent has granted consent above.
      </p>
    );
  }

  if (usableTemplates.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        No approved themes are available in this child&apos;s language yet.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {usableTemplates.map((template) => (
          <label
            key={template.id}
            className="flex cursor-pointer items-center gap-3 rounded-xl2 border border-[rgb(var(--color-border))] p-3 hover:bg-ink-50"
          >
            <input type="radio" name="templateId" value={template.id} required className="h-4 w-4" />
            <div>
              <p className="font-medium text-ink-800">{template.title}</p>
              <Badge tone="neutral">{template.theme_key.replace(/_/g, ' ')}</Badge>
            </div>
          </label>
        ))}
      </div>
      {state.error && <p className="text-sm text-coral-600">{state.error}</p>}
      <GenerateButton label={t('generate')} />
    </form>
  );
}

/** useFormStatus only reports the status of the nearest ancestor <form>,
 * so this has to be a component nested inside it — not inline in
 * CreateStoryForm's own return, which renders that <form> rather than
 * being inside it. */
function GenerateButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? 'Generating…' : label}
      </Button>
      {pending && (
        <p className="text-sm text-ink-500">
          Creating the illustrations now — this can take up to a minute. You&apos;ll be taken to the
          story&apos;s page automatically once it starts.
        </p>
      )}
    </div>
  );
}
