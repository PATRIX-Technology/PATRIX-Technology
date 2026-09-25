import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getSignedAssetUrls } from '@/lib/domain/storage';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ApprovalActions } from '@/components/stories/ApprovalActions';
import { RegeneratePageButton } from '@/components/stories/RegeneratePageButton';
import { DownloadButton } from '@/components/stories/DownloadButton';
import { AutoRefresh } from '@/components/stories/AutoRefresh';
import type { StoryStatus } from '@/types/database';

export default async function StoryDetailPage({
  params,
}: {
  params: { locale: string; storyId: string };
}) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('stories');
  if (!context) return null;

  const { data: story } = await supabase
    .from('stories')
    .select('*, children(first_name)')
    .eq('id', params.storyId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!story) notFound();

  const { data: pages } = await supabase
    .from('story_pages')
    .select('*')
    .eq('story_id', story.id)
    .order('page_number');

  const assetPaths = (pages ?? []).map((p) => p.image_asset_path).filter((p): p is string => Boolean(p));
  const signedUrls = await getSignedAssetUrls(supabase, assetPaths);

  const allGenerated = (pages ?? []).every((p) => p.image_status === 'GENERATED');
  const stillGenerating = (pages ?? []).some(
    (p) => p.image_status === 'QUEUED' || p.image_status === 'GENERATING',
  );
  const childName = (story.children as unknown as { first_name: string } | null)?.first_name ?? 'Unknown';
  const status = story.status as StoryStatus;

  return (
    <div className="space-y-6">
      <AutoRefresh active={stillGenerating} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink-900">
            {childName} — {story.theme_key.replace(/_/g, ' ')}
          </h1>
          <Badge tone="info" className="mt-2">
            {t(`status.${status}`)}
          </Badge>
          {stillGenerating && (
            <p className="mt-2 text-sm text-ink-500">
              Generating illustrations — this page updates automatically, no need to refresh.
            </p>
          )}
        </div>
        {status === 'APPROVED' && (
          <div className="flex gap-2">
            <DownloadButton
              href={`/api/stories/${story.id}/pdf`}
              fallbackFileName={`${childName}-${story.theme_key}.pdf`}
              failedTitle={t('downloadFailedTitle')}
              failedBody={t('downloadFailedBody')}
            >
              {t('downloadPdf')}
            </DownloadButton>
          </div>
        )}
      </div>

      {(status === 'NEEDS_REVIEW' || status === 'GENERATED') && (
        <Card>
          <CardTitle>Review &amp; approve</CardTitle>
          <div className="mt-4">
            <ApprovalActions locale={params.locale} storyId={story.id} canApprove={allGenerated} />
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {(pages ?? []).map((page) => (
          <Card key={page.id} className="flex flex-col gap-4 sm:flex-row">
            <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl2 bg-ink-50">
              {page.image_asset_path && signedUrls[page.image_asset_path] ? (
                <img
                  src={signedUrls[page.image_asset_path]}
                  alt={`Page ${page.page_number}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-ink-400">{page.image_status}</span>
              )}
            </div>
            <div className="flex-1">
              <p className="mb-2 text-sm font-medium text-ink-500">Page {page.page_number}</p>
              <p className="mb-3 text-ink-800">{page.text}</p>
              <Badge tone={page.image_status === 'GENERATED' ? 'success' : 'warning'}>
                {page.image_status}
              </Badge>
              {page.last_error && <p className="mt-2 text-xs text-coral-600">{page.last_error}</p>}
              <div className="mt-3">
                <RegeneratePageButton locale={params.locale} storyId={story.id} pageId={page.id} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
