import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getSignedAssetUrls } from '@/lib/domain/storage';
import { MAX_MANUAL_REGENERATIONS_PER_PAGE } from '@/lib/domain/stories';
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

  // children!stories_child_id_fkey disambiguates the embed: migration 0030
  // added a second FK from stories to children (the composite
  // stories_child_tenant_fkey, for cross-tenant integrity), so PostgREST
  // can no longer infer a single relationship on its own. Left as a bare
  // `children(...)` embed, this query silently errors ("more than one
  // relationship was found") -- and since the error here is discarded,
  // `story` comes back undefined and this page 404s. That broke viewing
  // ANY story (detail page, list page, PDF render -- see the same fix in
  // story-pdf.ts and stories/page.tsx) for every tenant, not just this
  // story, ever since 0030 shipped. Found via a live end-to-end QA pass.
  const { data: story } = await supabase
    .from('stories')
    .select('*, children!stories_child_id_fkey(first_name, arabic_first_name)')
    .eq('id', params.storyId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();
  if (!story) notFound();

  // This page used to call runWorkerOnce (real Gemini image generation)
  // synchronously during its own render, on every load AND on every
  // 4-second AutoRefresh poll while anything was still generating -- up
  // to 10 real Gemini calls per tick. That repeatedly re-exposed this
  // page to Vercel's 60-second function ceiling (see docs/DECISIONS.md
  // "maxDuration must not exceed the Hobby ceiling"): a real, multi-page
  // story generating in Arabic hit it and crashed the whole page with no
  // usable error. Fixed by no longer doing any generation work here at
  // all -- this page is now a plain read of current DB state. AutoRefresh
  // below drives generation forward itself, from client-side JS, via
  // kickStoryWorkerAction -- a separate request whose own worst case is a
  // bounded wall-clock deadline inside runWorkerOnce, not this page's
  // render. /api/cron/worker (every 5 minutes) remains the fallback for
  // when nobody has this page open.
  const { data: pages } = await supabase
    .from('story_pages')
    .select('*')
    .eq('story_id', story.id)
    .order('page_number');

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
  // A freshly created page starts life as PENDING and is only ever moved
  // straight to GENERATING once a worker actually claims its job -- there
  // is no step that sets image_status to QUEUED (only the underlying
  // story_jobs row is QUEUED). Checking only for QUEUED/GENERATING here
  // meant a brand new story, opened only by the person who just created
  // it, never activated AutoRefresh at all: nothing ever called
  // kickStoryWorkerAction for it, so it sat untouched until the
  // best-effort cron (every 5 minutes, sometimes hours late) happened to
  // reach it -- this is what actually left the two Lara stories stuck at
  // PENDING/0 attempts for hours. Any status short of a terminal one
  // needs the poll running.
  const stillGenerating = (pages ?? []).some(
    (p) => p.image_status !== 'GENERATED' && p.image_status !== 'FAILED',
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
          {stillGenerating && <p className="mt-2 text-sm text-ink-500">{t('generationNote')}</p>}
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
          <CardTitle>{t('reviewApproveTitle')}</CardTitle>
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
              <p className="mb-2 text-sm font-medium text-ink-500">{t('pageLabel', { number: page.page_number })}</p>
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
