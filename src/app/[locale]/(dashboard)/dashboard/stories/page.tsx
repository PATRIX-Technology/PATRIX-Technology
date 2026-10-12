import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { EmptyState } from '@/components/ui/EmptyState';
import { DownloadButton } from '@/components/stories/DownloadButton';
import { SuggestTemplateDialog } from '@/components/stories/SuggestTemplateDialog';
import { StoriesListWithBulkOrder, type ChildFolder } from '@/components/stories/StoriesListWithBulkOrder';

export default async function StoriesPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('stories');
  if (!context) return null;

  const { count: approvedCount } = await supabase
    .from('stories')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED');

  // children!stories_child_id_fkey disambiguates the embed -- see the
  // fuller note in stories/[storyId]/page.tsx. Without it, this whole
  // list query silently errors and every tenant with existing stories
  // sees an empty "No stories yet" list instead of their real stories.
  const { data: stories } = await supabase
    .from('stories')
    .select(
      'id, child_id, theme_key, status, locale, created_at, children!stories_child_id_fkey(first_name, arabic_first_name)',
    )
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  // Each story's row shows its template's real title in BOTH languages at
  // once (e.g. "Colours of Gratitude" + "ألوان الشكر"), regardless of
  // which single locale that particular story was generated in — not the
  // raw snake_case theme_key, which is always English. Fetched once for
  // every theme_key actually in use (both locale rows), rather than per
  // row. See docs/DECISIONS.md "Bilingual titles in the stories list".
  const { data: templateRows } = await supabase
    .from('story_theme_templates')
    .select('theme_key, locale, title')
    .in('theme_key', [...new Set((stories ?? []).map((s) => s.theme_key))])
    .in('locale', ['en', 'ar']);
  const titleEnByThemeKey = new Map(
    (templateRows ?? []).filter((row) => row.locale === 'en').map((row) => [row.theme_key, row.title]),
  );
  const titleArByThemeKey = new Map(
    (templateRows ?? []).filter((row) => row.locale === 'ar').map((row) => [row.theme_key, row.title]),
  );

  // One folder per child, so a nursery with several stories per kid isn't
  // just a flat, hard-to-scan list. Children with no story left do not
  // appear at all — a folder implies "there's something inside it".
  const childFolders = new Map<string, ChildFolder>();
  for (const story of stories ?? []) {
    const child = story.children as unknown as { first_name: string; arabic_first_name: string | null } | null;
    // Arabic-locale viewers see the child's Arabic name first, same as the
    // Children list -- falls back to the English name when no Arabic name
    // is on file, rather than showing nothing.
    const childNameIsArabic = params.locale === 'ar' && Boolean(child?.arabic_first_name);
    const childName = (childNameIsArabic ? child?.arabic_first_name : child?.first_name) || t('noChildName');
    const fallbackTitle = story.theme_key.replace(/_/g, ' ');
    const storyRow = {
      id: story.id,
      theme_key: story.theme_key,
      status: story.status,
      locale: story.locale,
      titleEn: titleEnByThemeKey.get(story.theme_key) ?? fallbackTitle,
      titleAr: titleArByThemeKey.get(story.theme_key) ?? fallbackTitle,
    };
    const existing = childFolders.get(story.child_id);
    if (existing) existing.stories.push(storyRow);
    else childFolders.set(story.child_id, { childId: story.child_id, childName, childNameIsArabic, stories: [storyRow] });
  }
  const sortedFolders = [...childFolders.values()].sort((a, b) => a.childName.localeCompare(b.childName));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SuggestTemplateDialog tenantName={context.tenantName} fullName={context.fullName} />
          {Boolean(approvedCount) && (
            <DownloadButton
              href="/api/stories/export-zip"
              fallbackFileName="stories.zip"
              failedTitle={t('bulkZipFailedTitle')}
              failedBody={t('bulkZipFailedBody')}
              variant="secondary"
              size="sm"
            >
              {t('bulkZip')}
            </DownloadButton>
          )}
        </div>
      </div>
      {!stories || stories.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <StoriesListWithBulkOrder locale={params.locale} folders={sortedFolders} tenantType={context.tenantType} />
      )}
    </div>
  );
}
