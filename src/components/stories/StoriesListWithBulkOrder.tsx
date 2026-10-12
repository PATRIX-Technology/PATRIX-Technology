'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ClickableRow } from '@/components/ui/ClickableRow';
import { BulkPrintOrderDialog, type BulkPrintOrderItem } from '@/components/stories/BulkPrintOrderDialog';
import type { StoryStatus, TenantType } from '@/types/database';

// Rotates through the app's existing accent palette so each child's
// folder name reads as a distinct, deliberate color rather than plain
// body text -- same tints CreateStoryForm.tsx already uses for category
// icons, reused here for visual consistency across the app.
const FOLDER_NAME_TINTS = ['text-lagoon-300', 'text-saffron-300', 'text-coral-300'];

const PRINT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

const STATUS_TONE: Record<StoryStatus, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = {
  DRAFT: 'neutral',
  QUEUED: 'neutral',
  GENERATING: 'info',
  GENERATED: 'info',
  NEEDS_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  FAILED: 'danger',
};

export interface StoryRow {
  id: string;
  theme_key: string;
  status: StoryStatus;
  locale: string;
  titleEn: string;
  titleAr: string;
}

export interface ChildFolder {
  childId: string;
  childName: string;
  childNameIsArabic: boolean;
  stories: StoryRow[];
}

/**
 * The tenant-wide stories list (child folders + per-story table), with an
 * optional "Select" mode layered on top -- same pattern as
 * ChildrenListWithBulkConsent.tsx -- that lets the owner check any number
 * of APPROVED stories, across any number of children's folders, and order
 * printed copies for all of them in one paid checkout. Only APPROVED
 * stories are selectable: there is no finished PDF to print for anything
 * else. See docs/DECISIONS.md "Bulk print ordering, paid online, replaces
 * the WhatsApp no-payment bypass" -- this is the actual bulk-order-and-pay
 * flow the founder asked for, not the removed per-story WhatsApp bypass.
 */
export function StoriesListWithBulkOrder({
  locale,
  folders,
  tenantType,
}: {
  locale: string;
  folders: ChildFolder[];
  tenantType: TenantType;
}) {
  const t = useTranslations('stories');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOrderOpen, setBulkOrderOpen] = useState(false);

  const approvedById = new Map(
    folders.flatMap((folder) =>
      folder.stories
        .filter((story) => story.status === 'APPROVED')
        .map((story) => [story.id, { ...story, childName: folder.childName }] as const),
    ),
  );

  function toggle(storyId: string) {
    if (!approvedById.has(storyId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const bulkItems: BulkPrintOrderItem[] = Array.from(selected)
    .map((id) => approvedById.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      storyId: row.id,
      childName: row.childName,
      title: locale === 'ar' ? row.titleAr : row.titleEn,
      locale: row.locale,
    }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        {selectMode ? (
          <>
            <span className="me-auto text-sm text-ink-600">{t('bulkOrder.selectedCount', { count: selected.size })}</span>
            <Button variant="secondary" size="sm" onClick={exitSelectMode}>
              {t('bulkOrder.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setBulkOrderOpen(true)}
              disabled={selected.size === 0}
            >
              {t('bulkOrder.orderFor', { count: selected.size })}
            </Button>
          </>
        ) : (
          approvedById.size > 0 && (
            <Button
              variant="primary"
              size="sm"
              leadingIcon={PRINT_ICON}
              onClick={() => setSelectMode(true)}
            >
              {t('bulkOrder.select')}
            </Button>
          )
        )}
      </div>

      <div className="space-y-4">
        {folders.map((folder, folderIndex) => (
          // <summary> must be a direct child of <details> -- see the fuller
          // note that used to live inline here before this was extracted
          // into its own component.
          <Card key={folder.childId} className="overflow-hidden p-0">
            <details className="group" open>
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-ink-100">
                <span className="flex items-center gap-2 font-display text-lg">
                  <span aria-hidden className="text-ink-400 transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  <span
                    dir={folder.childNameIsArabic ? 'rtl' : undefined}
                    className={FOLDER_NAME_TINTS[folderIndex % FOLDER_NAME_TINTS.length]}
                  >
                    {folder.childName}
                  </span>
                </span>
                <span className="text-xs text-ink-500">{t('storyCount', { count: folder.stories.length })}</span>
              </summary>
              <table className="w-full border-t border-[rgb(var(--color-border))] text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
                    {selectMode && <th className="w-10 p-4" />}
                    <th className="p-4">{t('columnTheme')}</th>
                    <th className="p-4">{t('columnLanguage')}</th>
                    <th className="p-4">{t('columnStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {folder.stories.map((story) => {
                    const selectable = story.status === 'APPROVED';
                    const isChecked = selected.has(story.id);
                    // Both language titles, always -- see
                    // docs/DECISIONS.md "Bilingual titles in the stories
                    // list". Primary follows the page's active UI locale;
                    // secondary is the other language, dir-flipped so
                    // Arabic reads correctly even inside an LTR page shell.
                    const primaryTitle = locale === 'ar' ? story.titleAr : story.titleEn;
                    const secondaryTitle = locale === 'ar' ? story.titleEn : story.titleAr;
                    const titleBlock = (
                      <span className="flex flex-col">
                        <span>{primaryTitle}</span>
                        <span className="text-xs text-ink-500" dir={locale === 'ar' ? 'ltr' : 'rtl'}>
                          {secondaryTitle}
                        </span>
                      </span>
                    );
                    const rowContent = (
                      <>
                        {selectMode && (
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!selectable}
                              onChange={() => toggle(story.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 disabled:opacity-30"
                              aria-label={t('bulkOrder.selectStory', { title: primaryTitle })}
                            />
                          </td>
                        )}
                        <td className="p-4">
                          {selectMode ? (
                            <span className="font-medium text-ink-900">{titleBlock}</span>
                          ) : (
                            <Link
                              href={`/${locale}/dashboard/stories/${story.id}`}
                              className="focus-ring font-medium text-ink-900 hover:text-lagoon-700"
                            >
                              {titleBlock}
                            </Link>
                          )}
                        </td>
                        <td className="p-4 text-ink-600">{story.locale.toUpperCase()}</td>
                        <td className="p-4">
                          <Badge tone={STATUS_TONE[story.status]}>{t(`status.${story.status}`)}</Badge>
                        </td>
                      </>
                    );

                    if (selectMode) {
                      return (
                        <tr
                          key={story.id}
                          onClick={() => toggle(story.id)}
                          className={`border-b border-[rgb(var(--color-border))] last:border-0 transition-colors ${
                            selectable ? 'cursor-pointer hover:bg-ink-50' : 'cursor-not-allowed opacity-60'
                          } ${isChecked ? 'bg-lagoon-900/20' : ''}`}
                        >
                          {rowContent}
                        </tr>
                      );
                    }
                    return (
                      <ClickableRow
                        key={story.id}
                        href={`/${locale}/dashboard/stories/${story.id}`}
                        className="border-b border-[rgb(var(--color-border))] last:border-0"
                      >
                        {rowContent}
                      </ClickableRow>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </Card>
        ))}
      </div>

      <BulkPrintOrderDialog
        items={bulkItems}
        open={bulkOrderOpen}
        onClose={() => {
          setBulkOrderOpen(false);
        }}
        tenantType={tenantType}
      />
    </div>
  );
}
