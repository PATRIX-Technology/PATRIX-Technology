'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useTranslations } from 'next-intl';
import { requestConsentBulkAction, type BulkConsentResultRow } from '@/lib/actions/children';
import { generateStoriesBulkAction, type BulkStoryResultRow } from '@/lib/actions/stories';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ClickableRow } from '@/components/ui/ClickableRow';
import { AvatarPreview } from '@/components/children/AvatarPreview';
import { parseAvatarConfig } from '@/lib/domain/avatar';
import { useToast } from '@/components/ui/Toast';
import { whatsappShareLink } from '@/lib/config/contact';
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
} from '@/components/stories/theme-picker-ui';
import type { Child, ConsentStatus } from '@/types/database';

const WHATSAPP_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.6 14.3c-.2.6-1.4 1.2-2 1.3-.5.1-1.1.1-1.8-.1a16 16 0 0 1-2.2-.8 12 12 0 0 1-4.5-4 13 13 0 0 1-1-1.6c-.3-.5-.6-1.2-.6-1.9 0-.9.5-1.4.7-1.6.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .6.4l.8 1.9c.1.2.1.4 0 .6l-.3.5-.3.4c-.1.1-.2.3 0 .5.3.5.9 1.3 1.7 1.9.8.7 1.6 1 1.9 1.2.3.1.4.1.6-.1l.6-.7c.2-.2.4-.2.6-.1l1.7.9c.2.1.4.2.4.4.1.3.1.8-.1 1.4Z" />
  </svg>
);

const CONSENT_TONE: Record<ConsentStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  not_requested: 'neutral',
  pending: 'warning',
  granted: 'success',
  declined: 'danger',
  withdrawn: 'danger',
};

export interface ThemeOption {
  themeKey: string;
  titleEn?: string;
  titleAr?: string;
  category: string;
}

/**
 * Renders the children roster (card list on mobile, table on desktop) with
 * two optional bulk flows layered on top of the same "Select" mode:
 * generating consent links (see docs/DECISIONS.md "Bulk consent-request
 * generation") and, for nursery tenants with at least one reviewed theme
 * (`themeOptions`), creating a story for every selected child from one
 * theme in a single pass (see docs/DECISIONS.md "Bulk story generation
 * across the roster"). Neither flow pre-answers anything on a parent's or
 * the system's behalf — consent links still need the parent's own
 * response, and story generation still enforces consent and quota exactly
 * as the single-child flow does, per child.
 */
export function ChildrenListWithBulkConsent({
  locale,
  childrenList,
  themeOptions = [],
}: {
  locale: string;
  childrenList: Child[];
  themeOptions?: ThemeOption[];
}) {
  const t = useTranslations('children');
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkConsentResultRow[] | null>(null);
  const [qrByChild, setQrByChild] = useState<Record<string, string>>({});

  const [themePickerOpen, setThemePickerOpen] = useState(false);
  // Which category's popup is open inside the theme picker (null = none)
  // -- same category-cards-then-popup pattern as the single-story picker
  // (CreateStoryForm.tsx), reusing its shared icon/label/accent constants.
  // See docs/DECISIONS.md "Category cards + popup template picker".
  const [openThemeCategory, setOpenThemeCategory] = useState<string | null>(null);
  const [selectedThemeKey, setSelectedThemeKey] = useState('');
  const [isStoryPending, startStoryTransition] = useTransition();
  const [storyResults, setStoryResults] = useState<BulkStoryResultRow[] | null>(null);

  function enterSelectMode() {
    setSelectMode(true);
    // Pre-check only the children who don't already have a link out —
    // matches "nothing filled in yet" rather than assuming staff wants to
    // re-request consent that's already pending, granted, or declined.
    setSelected(new Set(childrenList.filter((c) => c.consent_status === 'not_requested').map((c) => c.id)));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggle(childId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  }

  function handleGenerate() {
    const childIds = Array.from(selected);
    startTransition(async () => {
      const result = await requestConsentBulkAction(locale, childIds);
      if (result.error) {
        showToast({ title: result.error, tone: 'error' });
        return;
      }
      const rows = result.results ?? [];
      setResults(rows);
      exitSelectMode();

      const qrEntries = await Promise.all(
        rows
          .filter((row) => row.consentUrl)
          .map(async (row) => [row.childId, await QRCode.toDataURL(row.consentUrl!, { margin: 1, width: 180 })] as const),
      );
      setQrByChild(Object.fromEntries(qrEntries));
    });
  }

  function handleCreateStories() {
    if (!selectedThemeKey) return;
    const childIds = Array.from(selected);
    startStoryTransition(async () => {
      const result = await generateStoriesBulkAction(locale, childIds, selectedThemeKey);
      if (result.error) {
        showToast({ title: result.error, tone: 'error' });
        return;
      }
      setStoryResults(result.results ?? []);
      setThemePickerOpen(false);
      setOpenThemeCategory(null);
      exitSelectMode();
    });
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ title: t('bulkConsent.copied'), tone: 'success' });
    } catch {
      showToast({ title: t('bulkConsent.copied'), description: url, tone: 'info' });
    }
  }

  const succeeded = results?.filter((r) => r.consentUrl) ?? [];
  const failed = results?.filter((r) => !r.consentUrl) ?? [];

  const storySucceeded = storyResults?.filter((r) => r.storyId) ?? [];
  const storyFailed = storyResults?.filter((r) => !r.storyId) ?? [];

  const themeCategories = sortCategories(Array.from(new Set(themeOptions.map((theme) => theme.category))));
  const selectedThemeOption = themeOptions.find((theme) => theme.themeKey === selectedThemeKey) ?? null;

  // Matches first/last name in both languages -- a nursery with a large
  // roster otherwise has no way to jump straight to one child. Purely a
  // view filter: selection (by child id, see `selected` above) and the
  // select-mode pre-check below are unaffected by what's currently
  // filtered, so narrowing the search never silently drops an existing
  // selection out from under the user.
  const searchNormalized = search.trim().toLocaleLowerCase();
  const filteredChildren = searchNormalized
    ? childrenList.filter((child) =>
        [child.first_name, child.last_name, child.arabic_first_name, child.arabic_last_name]
          .filter(Boolean)
          .some((part) => part!.toLocaleLowerCase().includes(searchNormalized)),
      )
    : childrenList;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {selectMode && (
            <p className="shrink-0 text-sm text-ink-600">{t('bulkConsent.selectedCount', { count: selected.size })}</p>
          )}
          <div className="relative min-w-0 max-w-xs flex-1">
            <svg
              aria-hidden
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="focus-ring w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] py-2 ps-9 pe-3 text-sm text-ink-900"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <Button variant="secondary" size="sm" onClick={exitSelectMode}>
                {t('bulkConsent.cancel')}
              </Button>
              {themeOptions.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setThemePickerOpen(true)}
                  disabled={selected.size === 0}
                >
                  {t('bulkStories.createFor', { count: selected.size })}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={handleGenerate} disabled={selected.size === 0} isLoading={isPending}>
                {t('bulkConsent.generateFor', { count: selected.size })}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={enterSelectMode}>
              {t('bulkConsent.select')}
            </Button>
          )}
        </div>
      </div>

      {searchNormalized && filteredChildren.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-500">{t('searchNoMatches')}</p>
      )}

      {/* Card list — phone viewport */}
      <div className="grid gap-3 md:hidden">
        {filteredChildren.map((child) => {
          const enName = [child.first_name, child.last_name].filter(Boolean).join(' ');
          const arName = [child.arabic_first_name, child.arabic_last_name].filter(Boolean).join(' ');
          const showArabicFirst = locale === 'ar' && Boolean(arName);
          const primaryName = showArabicFirst ? arName : enName;
          const secondaryName = showArabicFirst ? enName : arName || null;
          const isChecked = selected.has(child.id);

          const cardInner = (
            <Card
              className={`flex items-center gap-4 p-4 transition-colors ${
                selectMode ? (isChecked ? 'border-lagoon-600' : '') : 'hover:border-lagoon-700 active:bg-ink-50'
              }`}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(child.id)}
                  className="h-5 w-5 shrink-0"
                  aria-label={t('bulkConsent.selectChild', { name: primaryName })}
                />
              )}
              <AvatarPreview config={parseAvatarConfig(child.avatar_config)} className="h-12 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p dir={showArabicFirst ? 'rtl' : undefined} className="truncate font-medium text-ink-900">
                    {primaryName}
                  </p>
                  <Badge tone={CONSENT_TONE[child.consent_status]} className="shrink-0">
                    {t(`consentStatus.${child.consent_status}`)}
                  </Badge>
                </div>
                {secondaryName && (
                  <p dir={showArabicFirst ? undefined : 'rtl'} className="truncate text-sm text-ink-600">
                    {secondaryName}
                  </p>
                )}
                <p className="truncate text-sm text-ink-500">
                  {child.class_name ?? t('noClassAssigned')} · {child.preferred_language.toUpperCase()}
                </p>
              </div>
            </Card>
          );

          return selectMode ? (
            <button key={child.id} type="button" onClick={() => toggle(child.id)} className="focus-ring text-left">
              {cardInner}
            </button>
          ) : (
            <Link key={child.id} href={`/${locale}/dashboard/children/${child.id}`} className="focus-ring block">
              {cardInner}
            </Link>
          );
        })}
      </div>

      {/* Table — desktop viewport */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
              {selectMode && <th className="w-10 p-4" />}
              <th className="p-4">{t('table.avatar')}</th>
              <th className="p-4">{t('table.firstNameEn')}</th>
              <th className="p-4">{t('table.lastNameEn')}</th>
              <th className="p-4">{t('table.firstNameAr')}</th>
              <th className="p-4">{t('table.lastNameAr')}</th>
              <th className="p-4">{t('table.class')}</th>
              <th className="p-4">{t('table.language')}</th>
              <th className="p-4">{t('table.consent')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredChildren.map((child) => {
              const isChecked = selected.has(child.id);
              const rowProps = selectMode
                ? {
                    onClick: () => toggle(child.id),
                    className: `cursor-pointer border-b border-[rgb(var(--color-border))] last:border-0 transition-colors hover:bg-ink-50 ${isChecked ? 'bg-lagoon-900/20' : ''}`,
                  }
                : { className: 'border-b border-[rgb(var(--color-border))] last:border-0' };

              const rowContent = (
                <>
                  {selectMode && (
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(child.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4"
                        aria-label={t('bulkConsent.selectChild', { name: child.first_name })}
                      />
                    </td>
                  )}
                  <td className="p-4">
                    <AvatarPreview config={parseAvatarConfig(child.avatar_config)} className="h-10 w-10" />
                  </td>
                  <td className="p-4">
                    {selectMode ? (
                      <span className="font-medium text-ink-900">{child.first_name}</span>
                    ) : (
                      <Link
                        href={`/${locale}/dashboard/children/${child.id}`}
                        className="focus-ring font-medium text-ink-900 hover:text-lagoon-700"
                      >
                        {child.first_name}
                      </Link>
                    )}
                  </td>
                  <td className="p-4 text-ink-600">{child.last_name ?? '—'}</td>
                  <td dir="rtl" className="p-4 text-ink-600">
                    {child.arabic_first_name ?? '—'}
                  </td>
                  <td dir="rtl" className="p-4 text-ink-600">
                    {child.arabic_last_name ?? '—'}
                  </td>
                  <td className="p-4 text-ink-600">{child.class_name ?? '—'}</td>
                  <td className="p-4 text-ink-600">{child.preferred_language.toUpperCase()}</td>
                  <td className="p-4">
                    <Badge tone={CONSENT_TONE[child.consent_status]}>{t(`consentStatus.${child.consent_status}`)}</Badge>
                  </td>
                </>
              );

              return selectMode ? (
                <tr key={child.id} {...rowProps}>
                  {rowContent}
                </tr>
              ) : (
                <ClickableRow
                  key={child.id}
                  href={`/${locale}/dashboard/children/${child.id}`}
                  className="border-b border-[rgb(var(--color-border))] last:border-0"
                >
                  {rowContent}
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Modal open={results !== null} onClose={() => setResults(null)} title={t('bulkConsent.resultsTitle')}>
        <div className="flex flex-col gap-4">
          {succeeded.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-600">
                {t('bulkConsent.successCount', { count: succeeded.length })}
              </p>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                {t('bulkConsent.print')}
              </Button>
            </div>
          )}

          {failed.length > 0 && (
            <div className="rounded-lg bg-coral-50 p-3 text-xs text-coral-700">
              {failed.map((row) => (
                <p key={row.childId}>
                  {row.childName}: {row.error}
                </p>
              ))}
            </div>
          )}

          {/* print:max-h-none + print:overflow-visible: without these, a
              fixed-height scroll container only prints whatever happened
              to be scrolled into view — the rest is silently cut off in
              Chrome/Safari's print rendering. */}
          <div className="grid max-h-96 gap-3 overflow-y-auto print:max-h-none print:overflow-visible">
            {succeeded.map((row) => (
              <div
                key={row.childId}
                className="flex items-center gap-3 rounded-xl2 border border-[rgb(var(--color-border))] p-3"
              >
                {qrByChild[row.childId] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrByChild[row.childId]} alt="" className="h-20 w-20 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{row.childName}</p>
                  <code className="mt-1 block truncate text-xs text-ink-500">{row.consentUrl}</code>
                </div>
                <div className="flex shrink-0 gap-2 print:hidden">
                  <a
                    href={whatsappShareLink(`${t('bulkConsent.whatsappMessage', { name: row.childName })} ${row.consentUrl}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-lagoon-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-lagoon-700"
                  >
                    {WHATSAPP_ICON}
                    {t('bulkConsent.whatsapp')}
                  </a>
                  <Button variant="secondary" size="sm" onClick={() => copyLink(row.consentUrl!)}>
                    {t('bulkConsent.copy')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Category cards -- clicking one opens that category's own popup
          (below) listing its themes, same pattern as the single-story
          picker (CreateStoryForm.tsx). See docs/DECISIONS.md "Category
          cards + popup template picker". */}
      <Modal open={themePickerOpen} onClose={() => setThemePickerOpen(false)} title={t('bulkStories.pickTheme')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-600">{t('bulkStories.pickThemeHint', { count: selected.size })}</p>
          <div className="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
            {themeCategories.map((category) => {
              const categoryThemes = themeOptions.filter((theme) => theme.category === category);
              const labels = CATEGORY_LABELS[category];
              const accent = CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
              const primaryLabel = labels ? (locale === 'ar' ? labels.ar : labels.en) : category;
              const secondaryLabel = labels ? (locale === 'ar' ? labels.en : labels.ar) : null;
              const selectedInCategory =
                selectedThemeOption && selectedThemeOption.category === category ? selectedThemeOption : null;
              const selectedTitle = selectedInCategory
                ? (locale === 'ar' ? selectedInCategory.titleAr : selectedInCategory.titleEn) ??
                  selectedInCategory.titleEn ??
                  selectedInCategory.titleAr
                : null;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setOpenThemeCategory(category)}
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
                      {t('bulkStories.templateCount', { count: categoryThemes.length })}
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
                    <span className="text-sm text-ink-500">{t('bulkStories.viewTemplates')}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setThemePickerOpen(false)}>
              {t('bulkConsent.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateStories}
              disabled={!selectedThemeKey}
              isLoading={isStoryPending}
            >
              {t('bulkStories.createFor', { count: selected.size })}
            </Button>
          </div>
        </div>
      </Modal>

      {themeCategories.map((category) => {
        const categoryThemes = themeOptions.filter((theme) => theme.category === category);
        const labels = CATEGORY_LABELS[category];
        const primaryLabel = labels ? (locale === 'ar' ? labels.ar : labels.en) : category;
        const secondaryLabel = labels ? (locale === 'ar' ? labels.en : labels.ar) : null;
        const accent = CATEGORY_ACCENTS[category] ?? DEFAULT_ACCENT;
        return (
          <Modal
            key={category}
            open={openThemeCategory === category}
            onClose={() => setOpenThemeCategory(null)}
            title={`${primaryLabel}${secondaryLabel ? ` · ${secondaryLabel}` : ''}`}
          >
            <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
              {categoryThemes.map((theme) => {
                const globalIndex = themeOptions.indexOf(theme);
                const primaryTitle = locale === 'ar' ? theme.titleAr ?? theme.titleEn : theme.titleEn ?? theme.titleAr;
                const secondaryTitle = locale === 'ar' ? theme.titleEn : theme.titleAr;
                return (
                  <label
                    key={theme.themeKey}
                    className={`group relative flex cursor-pointer flex-col gap-3 rounded-xl2 border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4 transition-all hover:-translate-y-0.5 hover:shadow-card has-[:checked]:border-saffron-500 has-[:checked]:shadow-card has-[:checked]:ring-2 has-[:checked]:ring-saffron-500/35 ${accent.cardBorder}`}
                  >
                    <input
                      type="radio"
                      name="bulk-theme"
                      value={theme.themeKey}
                      checked={selectedThemeKey === theme.themeKey}
                      onChange={() => {
                        setSelectedThemeKey(theme.themeKey);
                        setOpenThemeCategory(null);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${ICON_TINTS[globalIndex % ICON_TINTS.length]}`}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        {THEME_ICONS[theme.themeKey] ?? FALLBACK_ICON}
                      </svg>
                    </span>
                    <div>
                      <p className="font-medium text-ink-800">{primaryTitle}</p>
                      {secondaryTitle && (
                        <p className="text-sm text-ink-500" dir={locale === 'ar' ? 'ltr' : 'rtl'}>
                          {secondaryTitle}
                        </p>
                      )}
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

      <Modal open={storyResults !== null} onClose={() => setStoryResults(null)} title={t('bulkStories.resultsTitle')}>
        <div className="flex flex-col gap-4">
          {storySucceeded.length > 0 && (
            <p className="text-sm text-ink-600">
              {t('bulkStories.successCount', { count: storySucceeded.length })}
            </p>
          )}
          {storyFailed.length > 0 && (
            <div className="rounded-lg bg-coral-50 p-3 text-xs text-coral-700">
              {storyFailed.map((row) => (
                <p key={row.childId}>
                  {row.childName}: {row.error}
                </p>
              ))}
            </div>
          )}
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {storySucceeded.map((row) => (
              <Link
                key={row.childId}
                href={`/${locale}/dashboard/stories/${row.storyId}`}
                className="focus-ring flex items-center justify-between gap-3 rounded-xl2 border border-[rgb(var(--color-border))] p-3 hover:border-lagoon-700"
              >
                <span className="font-medium text-ink-900">{row.childName}</span>
                <span className="text-xs text-ink-500">{t('bulkStories.view')}</span>
              </Link>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
