import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DownloadButton } from '@/components/stories/DownloadButton';
import { ClickableRow } from '@/components/ui/ClickableRow';
import type { StoryStatus } from '@/types/database';

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

  const { data: stories } = await supabase
    .from('stories')
    .select('id, child_id, theme_key, status, locale, created_at, children(first_name)')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  // One folder per child, so a nursery with several stories per kid isn't
  // just a flat, hard-to-scan list. Children with no story left do not
  // appear at all — a folder implies "there's something inside it".
  const childFolders = new Map<
    string,
    { childName: string; stories: NonNullable<typeof stories> }
  >();
  for (const story of stories ?? []) {
    const childName =
      (story.children as unknown as { first_name: string } | null)?.first_name || t('noChildName');
    const existing = childFolders.get(story.child_id);
    if (existing) existing.stories.push(story);
    else childFolders.set(story.child_id, { childName, stories: [story] });
  }
  const sortedFolders = [...childFolders.values()].sort((a, b) => a.childName.localeCompare(b.childName));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
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
      {!stories || stories.length === 0 ? (
        <EmptyState title="No stories yet" body="Create one from a child's profile page." />
      ) : (
        <div className="space-y-4">
          {sortedFolders.map((folder) => (
            <details key={folder.stories[0]!.child_id} className="group" open>
              <Card className="overflow-hidden p-0">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-ink-100">
                  <span className="flex items-center gap-2 font-display text-lg text-ink-900">
                    <span aria-hidden className="text-ink-400 transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    {folder.childName}
                  </span>
                  <span className="text-xs text-ink-500">{t('storyCount', { count: folder.stories.length })}</span>
                </summary>
                <table className="w-full border-t border-[rgb(var(--color-border))] text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
                      <th className="p-4">Theme</th>
                      <th className="p-4">Language</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folder.stories.map((story) => (
                      <ClickableRow
                        key={story.id}
                        href={`/${params.locale}/dashboard/stories/${story.id}`}
                        className="border-b border-[rgb(var(--color-border))] last:border-0"
                      >
                        <td className="p-4">
                          <Link
                            href={`/${params.locale}/dashboard/stories/${story.id}`}
                            className="focus-ring font-medium capitalize text-ink-900 hover:text-lagoon-700"
                          >
                            {story.theme_key.replace(/_/g, ' ')}
                          </Link>
                        </td>
                        <td className="p-4 text-ink-600">{story.locale.toUpperCase()}</td>
                        <td className="p-4">
                          <Badge tone={STATUS_TONE[story.status as StoryStatus]}>
                            {t(`status.${story.status}`)}
                          </Badge>
                        </td>
                      </ClickableRow>
                    ))}
                  </tbody>
                </table>
              </Card>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
