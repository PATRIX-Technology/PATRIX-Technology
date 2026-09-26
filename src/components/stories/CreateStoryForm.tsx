'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createStoryAction, type CreateStoryResult } from '@/lib/actions/stories';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useEffect, useRef } from 'react';
import type { ConsentStatus, NativeReviewStatus } from '@/types/database';

interface TemplateOption {
  id: string;
  theme_key: string;
  title: string;
  locale: string;
  native_review_status: NativeReviewStatus;
}

const THEME_ICONS: Record<string, JSX.Element> = {
  healthy_eating: (
    <path
      d="M12 3c-3 2-6 2-8 1v9c2-1 5-1 8 1 3-2 6-2 8-1V4c-2 1-5 1-8-1Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  brushing_teeth: (
    <path
      d="M5 4h6a4 4 0 0 1 4 4v11a2 2 0 0 1-4 0v-6H9v6a2 2 0 0 1-4 0V4Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  first_day_school: (
    <path
      d="M12 3 3 8l9 5 9-5-9-5Zm-6 7.2V16c0 1.8 2.5 3 6 3s6-1.2 6-3v-5.8"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  new_sibling: (
    <path
      d="M12 20s-7-4.2-9.3-8.4C.9 8.4 3 5 6.5 5c2 0 3.3 1 5.5 3.3C14.2 6 15.5 5 17.5 5 21 5 23.1 8.4 21.3 11.6 19 15.8 12 20 12 20Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  honesty: (
    <path
      d="M12 3l7 3v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6l7-3Zm-3 8.5 2 2 4-4.5"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  hand_washing: (
    <path
      d="M12 2c2 3 5 6 5 10a5 5 0 0 1-10 0c0-4 3-7 5-10Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  saving_money: (
    <path
      d="M4 12c0-3.3 3.1-6 7-6 2 0 3.8.7 5 1.8l2-.3.6 2-1.4 1c.3.8.4 1.6.3 2.4C17.1 16.4 13.9 19 10 19c-3.9 0-6-2.5-6-4v-3Zm3-2.2h.01"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  national_day_gratitude: (
    <path
      d="M12 2v14M12 2l4 3-4 3-4-3 4-3Zm-6 18h12"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const FALLBACK_ICON = (
  <path
    d="M4 6h16M4 12h16M4 18h10"
    stroke="currentColor"
    strokeWidth="1.7"
    fill="none"
    strokeLinecap="round"
  />
);

const ICON_TINTS = ['bg-lagoon-900/50 text-lagoon-300', 'bg-saffron-900/40 text-saffron-300', 'bg-coral-900/40 text-coral-300'];

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
  const showToast = useToast();
  const router = useRouter();
  const action = createStoryAction.bind(null, locale, childId);
  const [state, formAction] = useFormState<CreateStoryResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});
  const submitCount = useRef(0);

  useEffect(() => {
    if (submitCount.current === 0) return;
    if (state.error) {
      showToast({ title: t('createFailedTitle'), description: state.error, tone: 'error' });
      return;
    }
    // Navigated here client-side rather than via redirect() inside the
    // action itself -- see docs/DECISIONS.md "Client-side navigation
    // instead of redirect() inside a useFormState action".
    if (state.storyId) {
      router.push(`/${locale}/dashboard/stories/${state.storyId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
    <form
      action={formAction}
      onSubmit={() => {
        submitCount.current += 1;
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {usableTemplates.map((template, index) => (
          <label
            key={template.id}
            className="group relative flex cursor-pointer flex-col gap-3 rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4 transition-all hover:-translate-y-0.5 hover:border-lagoon-700 hover:shadow-card has-[:checked]:border-saffron-500 has-[:checked]:shadow-card has-[:checked]:ring-2 has-[:checked]:ring-saffron-500/35"
          >
            <input type="radio" name="templateId" value={template.id} required className="peer sr-only" />
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${ICON_TINTS[index % ICON_TINTS.length]}`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                {THEME_ICONS[template.theme_key] ?? FALLBACK_ICON}
              </svg>
            </span>
            <div>
              <p className="font-medium text-ink-800">{template.title}</p>
              <p className="text-xs capitalize text-ink-500">{template.theme_key.replace(/_/g, ' ')}</p>
            </div>
            <span className="absolute end-3 top-3 text-xs font-semibold text-saffron-400 opacity-0 peer-checked:opacity-100">
              ✓
            </span>
          </label>
        ))}
      </div>
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
