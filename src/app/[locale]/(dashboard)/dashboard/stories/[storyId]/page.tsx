import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getSignedAssetUrls } from '@/lib/domain/storage';
import { runWorkerOnce } from '@/lib/jobs/worker';
import { MAX_MANUAL_REGENERATIONS_PER_PAGE } from '@/lib/domain/stories';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ApprovalActions } from '@/components/stories/ApprovalActions';
import { RegeneratePageButton } from '@/components/stories/RegeneratePageButton';
import { DownloadButton } from '@/components/stories/DownloadButton';
import { AutoRefresh } from '@/components/stories/AutoRefresh';
import type { StoryStatus } from '@/types/database';

// This page now calls runWorkerOnce (real Gemini image generation) during
// its own render -- see docs/DECISIONS.md "Story creation no longer waits
// on the worker before redirecting". Vercel's default function duration is
// well under 60s unless a route says otherwise, and 60 is the actual
// ceiling on the current (Hobby) plan regardless of what's requested here
// -- see docs/DECISIONS.md "maxDuration must not exceed the Hobby
// ceiling". Every other route in this app doing real generation work
// already sets this explicitly; this page needs the same now that it does
// generation work too.
export const maxDuration = 60;

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
    .select('*, children(first_name, arabic_first_name)')
    .eq('id', params.storyId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!story) notFound();

  const { data: initialPages } = await supabase
    .from('story_pages')
    .select('*')
    .eq('story_id', story.id)
    .order('page_number');

  // Story creation and "regenerate this page" no longer wait on the
  // worker themselves before returning — see docs/DECISIONS.md "Story
  // creation no longer waits on the worker before redirecting". This
  // page picks the resulting queued job(s) up instead: on the very
  // first load right after creating a story, and again on every
  // AutoRefresh poll below while anything is still generating, so
  // watching this page keeps making progress even between the
  // scheduled worker's own 5-minute cron ticks. A bounded batch size
  // (not the cron's 25) keeps any one page load's share of the work
  // modest, since a slow real-provider run here just means a slower
  // page load, never a vanished redirect.
  const hasQueuedWork = (initialPages ?? []).some(
    (p) => p.image_status === 'QUEUED' || p.image_status === 'GENERATING',
  );
  if (hasQueuedWork) {
    try {
      const serviceClient = createSupabaseServiceRoleClient();
      await runWorkerOnce(serviceClient, 10);
    } catch {
      // Non-fatal: the next auto-refresh or the scheduled worker retries.
    }
  }

  const { data: pages } = hasQueuedWork
    ? await supabase.from('story_pages').select('*').eq('story_id', story.id).order('page_number')
    : { data: initialPages };

  // The story's own title/synopsis are never stored on the row itself —
  // only the per-page text is baked in at creation time (see
  // docs/DECISIONS.md) — so the title is read fresh from the live
  // template every time, by (theme_key, locale). This also means a
  // template title fix (like the Arabic gender-agreement one) is
  // reflected immediately on every existing story, with no resync
  // needed for titles specifically.
  const { data: templateRow } = await supabase
    .from('story_theme_templates')
    .select('title')
    .eq('theme_key', story.theme_key)
    .eq('locale', story.locale)
    .maybeSingle();

  const assetPaths = (pages ?? []).map((p) => p.image_asset_path).filter((p): p is string => Boolean(p));
  const signedUrls = await getSignedAssetUrls(supabase, assetPaths);

  const allGenerated = (pages ?? []).every((p) => p.image_status === 'GENERATED');
  const stillGenerating = (pages ?? []).some(
    (p) => p.image_status === 'QUEUED' || p.image_status === 'GENERATING',
  );
  const child = story.children as unknown as { first_name: string; arabic_first_name: string | null } | null;
  // Same rule as story creation: an Arabic story shows the Arabic name,
  // never the Latin one, and vice versa — see docs/DECISIONS.md "Arabic
  // name is required, not a silent fallback".
  const childName =
    (story.locale === 'ar' ? child?.arabic_first_name : child?.first_name) ?? child?.first_name ?? 'Unknown';
  const storyTitle = templateRow?.title ?? story.theme_key.replace(/_/g, ' ');
  const status = story.status as StoryStatus;

  return (
    <div className="space-y-6">
      <AutoRefresh active={stillGenerating} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink-900">
            {childName} — {storyTitle}
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
              {status !== 'APPROVED' && (
                <div className="mt-3">
                  <RegeneratePageButton
                    locale={params.locale}
                    storyId={story.id}
                    pageId={page.id}
                    remaining={Math.max(0, MAX_MANUAL_REGENERATIONS_PER_PAGE - page.regenerate_count)}
                  />
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
