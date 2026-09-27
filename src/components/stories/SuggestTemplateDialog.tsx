'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormState } from 'react-dom';
import { suggestStoryTemplateAction } from '@/lib/actions/story-suggestions';
import type { ActionResult } from '@/lib/actions/auth';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { whatsappLink } from '@/lib/config/contact';

/**
 * Lets a nursery or family suggest a new story theme/habit idea
 * straight from the Stories page — see docs/DECISIONS.md "Story
 * template suggestions". The suggestion is always saved to
 * story_template_suggestions first (durable, reviewable by the
 * founder any time); the WhatsApp button that appears afterwards is
 * an *additional*, optional fast-path — a plain wa.me link the
 * submitter taps themselves, not something sent automatically. There
 * is no WhatsApp Business API wired into this app (that needs a real
 * business account and API keys, a founder-side setup step), so a
 * one-tap pre-filled link is the only way to land this on his personal
 * WhatsApp without one.
 */
export function SuggestTemplateDialog({
  tenantName,
  fullName,
}: {
  tenantName: string;
  fullName: string;
}) {
  const t = useTranslations('stories');
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');

  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return suggestStoryTemplateAction(formData);
  }, {});

  const submitted = state?.message === 'saved';

  function handleClose() {
    setOpen(false);
    setTopic('');
    setDescription('');
  }

  const waMessage = [
    `${t('suggestIdeaWhatsappPrefix')} ${tenantName} (${fullName})`,
    '',
    `${t('suggestIdeaTopicLabel')}: ${topic}`,
    '',
    `${t('suggestIdeaWhatsappDescriptionLabel')}: ${description}`,
  ].join('\n');
  const waLink = whatsappLink(waMessage);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        💡 {t('suggestIdea')}
      </Button>
      <Modal open={open} onClose={handleClose} title={t('suggestIdeaTitle')}>
        {submitted ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-700">{t('suggestIdeaSuccessTitle')}</p>
            <p className="text-sm text-ink-600">{t('suggestIdeaSuccessBody')}</p>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer">
                <Button type="button" className="w-full">
                  {t('suggestIdeaWhatsappCta')}
                </Button>
              </a>
            )}
            <Button type="button" variant="secondary" onClick={handleClose}>
              {t('suggestIdeaClose')}
            </Button>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <p className="text-sm text-ink-600">{t('suggestIdeaBody')}</p>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink-800">{t('suggestIdeaTopicLabel')}</span>
              <input
                type="text"
                name="topic"
                required
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={t('suggestIdeaTopicPlaceholder')}
                className="focus-ring rounded-lg border border-[rgb(var(--color-border))] p-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink-800">{t('suggestIdeaDescriptionQuestion')}</span>
              <textarea
                name="description"
                required
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="focus-ring rounded-lg border border-[rgb(var(--color-border))] p-2 text-sm"
              />
            </label>
            {state?.error && (
              <p role="alert" className="text-sm text-coral-600">
                {state.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                {t('suggestIdeaClose')}
              </Button>
              <Button type="submit">{t('suggestIdeaSubmit')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
