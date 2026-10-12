'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createStoryAction, type CreateStoryResult } from '@/lib/actions/stories';
import { useSafeFormReducer } from '@/lib/actions/use-safe-form-reducer';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useEffect, useRef, useState } from 'react';
import type { ConsentStatus } from '@/types/database';
import {
  CATEGORY_ACCENTS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  DEFAULT_ACCENT,
  DEFAULT_CATEGORY_ICON,
  FALLBACK_ICON,
  ICON_TINTS,
  THEME_ICONS,
  sortCategories,
} from './theme-picker-ui';

interface TemplateOption {
  id: string;
  theme_key: string;
  titleEn: string;
  titleAr: string;
  category: string;
  /** Whether this theme has both EN and AR template rows (the AR one
   * already review-gated — see the computation in children/[childId]/
   * page.tsx) so a bilingual-in-one-book story can be generated for it.
   * See docs/DECISIONS.md "Bilingual-in-one-book generation". */
  bilingualAvailable: boolean;
}

export function CreateStoryForm({
  locale,
  childId,
  consentStatus,
  templates,
  childHasArabicName,
  defaultBilingual,
}: {
  locale: string;
  childId: string;
  consentStatus: ConsentStatus;
  templates: TemplateOption[];
  /** Gates the bilingual checkbox -- see createStoryAction's own hard
   * block on the same condition in src/lib/actions/stories.ts. */
  childHasArabicName: boolean;
  /** Pre-checks the bilingual checkbox from the child's own CSV-import/
   * profile preference (children.bilingual_stories) rather than always
   * defaulting to off -- see docs/DECISIONS.md "Bilingual-in-one-book
   * generation". Still just a default: the family/nursery can override
   * it per story. */
  defaultBilingual: boolean;
}) {
  const t = useTranslations('stories');
  const showToast = useToast();
  const router = useRouter();
  const action = createStoryAction.bind(null, locale, childId);
  const [state, formAction] = useFormState<CreateStoryResult, FormData>(
    useSafeFormReducer(async (_prev, formData) => action(formData)),
    {},
  );
  const submitCount = useRef(0);
  const [bilingual, setBilingual] = useState(defaultBilingual);
  // Which category's popup is currently open (null = none) and which
  // template is currently selected across all categories -- controlled
  // state so the category card can show a "selected" summary and the
  // radio choice survives the popup closing. See docs/DECISIONS.md
  // "Category cards + popup template picker".
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (submitCount.current === 0) return;
    // Defensive: on a slow/aborted request (e.g. a Vercel function
    // timeout mid-generation, see docs/DECISIONS.md "Story generation
    // no longer blocks the request on real image generation"), the
    // dispatched action's promise can settle without a normal resolved
    // ActionResult, and useFormState's exposed state has been observed
    // to come back as undefined in that case rather than throwing --
    // reading state.error directly then crashes the whole page instead
    // of just failing this one submission.
    if (!state) return;
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

  // Review-status filtering now happens server-side (both locale rows have
  // to clear the gate before a theme is passed down at all) -- see the
  // query in children/[childId]/page.tsx.
  const usableTemplates = templates;
  const consentGranted = consentStatus === 'granted';

  const categories = sortCategories(Array.from(new Set(usableTemplates.map((tpl) => tpl.category))));

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

  const selectedTemplate = usableTemplates.find((tpl) => tpl.id === selectedTemplateId) ?? null;

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitCount.current += 1;
      }}
      className="flex flex-col gap-6"
    >
      {/* Category card boxes -- clicking one opens that category's popup
          (below) rather than expanding inline, so the picker reads as a
          deliberate, modern grid rather than a stack of accordions. See
          docs/DECISIONS.md "Category cards + popup template picker". */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const categoryTemplates = usableTemplates.filter((tpl) => tpl.category === category);
          const labels = CATEGORY_LABELS[category];
          const accent = CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
          const primaryLabel = labels ? (locale === 'ar' ? labels.ar : labels.en) : category;
          const secondaryLabel = labels ? (locale === 'ar' ? labels.en : labels.ar) : null;
          const selectedInCategory =
            selectedTemplate && selectedTemplate.category === category ? selectedTemplate : null;
          const selectedTitle = selectedInCategory
            ? locale === 'ar'
              ? selectedInCategory.titleAr
              : selectedInCategory.titleEn
            : null;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setOpenCategory(category)}
              className={`focus-ring group relative flex flex-col gap-3 rounded-xl2 border p-4 text-start transition-all hover:-translate-y-0.5 hover:shadow-card ${
                selectedInCategory
                  ? 'border-saffron-500 shadow-card ring-2 ring-saffron-500/35'
                  : `border-[rgb(var(--color-border))] ${accent.cardBorder}`
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent.header}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    {CATEGORY_ICONS[category] ?? DEFAULT_CATEGORY_ICON}
                  </svg>
                </span>
                <span className="text-xs font-medium text-ink-500">
                  {t('picker.templateCount', { count: categoryTemplates.length })}
                </span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-base text-ink-900">{primaryLabel}</span>
                {secondaryLabel && <span className="text-sm text-ink-500">{secondaryLabel}</span>}
              </span>
              {selectedTitle ? (
                <span className="flex items-center gap-1.5 text-sm text-saffron-400">
                  <span aria-hidden>✓</span>
                  <span className="truncate">{selectedTitle}</span>
                </span>
              ) : (
                <span className="text-sm text-ink-500">{t('picker.viewTemplates')}</span>
              )}
            </button>
          );
        })}
      </div>

      {categories.map((category) => {
        const categoryTemplates = usableTemplates.filter((tpl) => tpl.category === category);
        const labels = CATEGORY_LABELS[category];
        const primaryLabel = labels ? (locale === 'ar' ? labels.ar : labels.en) : category;
        const secondaryLabel = labels ? (locale === 'ar' ? labels.en : labels.ar) : null;
        const accent = CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
        return (
          // Always mounted (not conditionally rendered) so every radio
          // input across every category stays part of this <form> at all
          // times -- only `open` toggles the dialog's own visibility, via
          // Modal's showModal()/close(). Unmounting on close would lose
          // the selection the moment the popup shuts.
          <Modal
            key={category}
            open={openCategory === category}
            onClose={() => setOpenCategory(null)}
            title={`${primaryLabel}${secondaryLabel ? ` · ${secondaryLabel}` : ''}`}
          >
            <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
              {categoryTemplates.map((template) => {
                const globalIndex = usableTemplates.indexOf(template);
                const primaryTitle = locale === 'ar' ? template.titleAr : template.titleEn;
                const secondaryTitle = locale === 'ar' ? template.titleEn : template.titleAr;
                return (
                  <label
                    key={template.id}
                    className={`group relative flex cursor-pointer flex-col gap-3 rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4 transition-all hover:-translate-y-0.5 hover:shadow-card has-[:checked]:border-saffron-500 has-[:checked]:shadow-card has-[:checked]:ring-2 has-[:checked]:ring-saffron-500/35 ${accent.cardBorder}`}
                  >
                    <input
                      type="radio"
                      name="templateId"
                      value={template.id}
                      required
                      checked={selectedTemplateId === template.id}
                      onChange={() => {
                        setSelectedTemplateId(template.id);
                        setOpenCategory(null);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${ICON_TINTS[globalIndex % ICON_TINTS.length]}`}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        {THEME_ICONS[template.theme_key] ?? FALLBACK_ICON}
                      </svg>
                    </span>
                    <div>
                      <p className="font-medium text-ink-800">{primaryTitle}</p>
                      <p className="text-sm text-ink-500" dir={locale === 'ar' ? 'ltr' : 'rtl'}>
                        {secondaryTitle}
                      </p>
                    </div>
                    <span className="absolute end-3 top-3 text-xs font-semibold text-saffron-400 opacity-0 peer-checked:opacity-100">
                      ✓
                    </span>
                  </label>
                );
              })}
            </div>
          </Modal>
        );
      })}

      {selectedTemplate && (
        <BilingualToggle
          checked={bilingual}
          onChange={setBilingual}
          disabled={!childHasArabicName || !selectedTemplate.bilingualAvailable}
          disabledReason={
            !childHasArabicName
              ? t('bilingual.needsArabicName')
              : !selectedTemplate.bilingualAvailable
                ? t('bilingual.notAvailableForTheme')
                : null
          }
          label={t('bilingual.toggleLabel')}
          hint={t('bilingual.toggleHint')}
        />
      )}

      <GenerateButton label={t('generate')} />
    </form>
  );
}

/**
 * "Generate in both languages" checkbox — see docs/DECISIONS.md
 * "Bilingual-in-one-book generation". A disabled checkbox still has to
 * explain itself (missing Arabic name on file, or this theme has no
 * Arabic row yet) rather than just sitting there unexplained.
 */
function BilingualToggle({
  checked,
  onChange,
  disabled,
  disabledReason,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
  disabledReason: string | null;
  label: string;
  hint: string;
}) {
  const effectiveChecked = checked && !disabled;
  return (
    <div className="rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="bilingual"
          checked={effectiveChecked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-saffron-500 disabled:opacity-50"
        />
        <span>
          <span className={`font-medium ${disabled ? 'text-ink-500' : 'text-ink-800'}`}>{label}</span>
          <span className="mt-1 block text-ink-500">{disabled && disabledReason ? disabledReason : hint}</span>
        </span>
      </label>
    </div>
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
