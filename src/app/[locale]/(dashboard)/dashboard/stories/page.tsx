import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
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

  const { data: classNames } = await supabase
    .from('children')
    .select('class_name')
    .eq('tenant_id', context.tenantId)
    .not('class_name', 'is', null);
  const distinctClassNames = [...new Set((classNames ?? []).map((c) => c.class_name as string))];

  const { data: stories } = await supabase
    .from('stories')
    .select('id, theme_key, status, locale, created_at, children(first_name)')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
        {distinctClassNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {distinctClassNames.map((className) => (
              <a
                key={className}
                href={`/api/classes/${encodeURIComponent(className)}/zip`}
                className="focus-ring rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-100"
              >
                {t('bulkZip')}: {className}
              </a>
            ))}
          </div>
        )}
      </div>
      {!stories || stories.length === 0 ? (
        <EmptyState title="No stories yet" body="Create one from a child's profile page." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
                <th className="p-4">Child</th>
                <th className="p-4">Theme</th>
                <th className="p-4">Language</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((story) => (
                <tr key={story.id} className="border-b border-[rgb(var(--color-border))] last:border-0">
                  <td className="p-4">
                    <Link
                      href={`/${params.locale}/dashboard/stories/${story.id}`}
                      className="focus-ring font-medium text-ink-900 hover:text-lagoon-700"
                    >
                      {(story.children as unknown as { first_name: string } | null)?.first_name ?? '—'}
                    </Link>
                  </td>
                  <td className="p-4 capitalize text-ink-600">{story.theme_key.replace(/_/g, ' ')}</td>
                  <td className="p-4 text-ink-600">{story.locale.toUpperCase()}</td>
                  <td className="p-4">
                    <Badge tone={STATUS_TONE[story.status as StoryStatus]}>
                      {t(`status.${story.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
