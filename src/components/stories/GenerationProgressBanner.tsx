'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  kickStoryWorkerAction,
  getGenerationProgressAction,
  type GenerationProgressResult,
} from '@/lib/actions/stories';

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 4_000;

/**
 * A persistent, dismissible progress bar for story illustrations
 * currently generating, mounted once at the dashboard layout level (see
 * (dashboard)/layout.tsx) rather than on the story detail page. Next.js
 * App Router keeps a shared layout mounted across navigations within it,
 * so this one instance keeps polling — and keeps nudging the job queue
 * forward via kickStoryWorkerAction, same as AutoRefresh does for a
 * single open story — no matter which dashboard page the user is
 * actually looking at, satisfying "generate in the background while I
 * keep browsing" rather than only while the story's own page is open.
 *
 * Polls at two speeds rather than a flat interval: every 15s, read-only,
 * while nothing is known to be in progress (cheap: a single
 * tenant+status query), so an idle dashboard isn't hammering the queue
 * for no reason; every 4s with an actual queue kick once something is
 * found in progress, until it settles.
 *
 * Dismissing (✕) only hides the card — polling keeps running underneath,
 * so the queue keeps moving in the background and a fresh batch is
 * caught immediately. The dismissal is scoped to the exact set of story
 * ids it was shown for (dismissedKey), not a blanket "don't show again",
 * so a new story created later reopens it automatically.
 */
export function GenerationProgressBanner({ locale }: { locale: string }) {
  const t = useTranslations('stories');
  const common = useTranslations('common');
  const router = useRouter();
  const isRtl = locale === 'ar';

  const [progress, setProgress] = useState<GenerationProgressResult | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const wasInProgress = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      // A phone backgrounding this tab (switching apps, locking the
      // screen) suspends its network connections; a poll in flight at
      // that moment, or scheduled while hidden, previously rejected with
      // a bare "TypeError: network error" the moment the tab came back
      // -- uncaught, since only the kick call below was wrapped, which
      // crashed the WHOLE page to the nearest error boundary (error.tsx)
      // until a manual refresh. Reported live: "when I go out of the
      // page to another app and come back ... then when I refresh it
      // back normally". Two changes fix it: skip the network work
      // entirely while hidden (resumed by the visibilitychange listener
      // below, with an immediate tick), and wrap the *whole* tick body
      // -- not just the kick -- so any other transient failure is
      // swallowed the same best-effort way the kick already was.
      if (document.visibilityState !== 'visible') return;

      try {
        if (wasInProgress.current) {
          await kickStoryWorkerAction();
        }
        const result = await getGenerationProgressAction();
        if (cancelled) return;

        if (result.storyIds.length > 0) {
          wasInProgress.current = true;
          setJustFinished(false);
          setProgress(result);
        } else if (wasInProgress.current) {
          // The batch that was running has now fully settled (either
          // ready for review or failed) — refresh so whichever page is
          // open picks up the new status, show a brief "done" state
          // (the last known progress stays on screen underneath it),
          // then clear.
          wasInProgress.current = false;
          router.refresh();
          setJustFinished(true);
          setTimeout(() => {
            if (!cancelled) {
              setJustFinished(false);
              setProgress(null);
            }
          }, 2500);
        }

        if (!cancelled) {
          timeoutId = setTimeout(tick, result.storyIds.length > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS);
        }
      } catch {
        // Best-effort — next tick, or the scheduled cron, retries.
        if (!cancelled) timeoutId = setTimeout(tick, IDLE_POLL_MS);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (timeoutId) clearTimeout(timeoutId);
      tick();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router]);

  if (!progress && !justFinished) return null;

  const currentKey = progress ? [...progress.storyIds].sort().join(',') : null;
  if (!justFinished && dismissedKey && currentKey === dismissedKey) return null;

  const pct =
    progress && progress.pagesTotal > 0 ? Math.round((progress.pagesGenerated / progress.pagesTotal) * 100) : 0;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center sm:inset-x-auto sm:start-4 sm:justify-start"
    >
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] p-4 shadow-card">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lagoon-900/50 text-lagoon-300 ${
              justFinished ? '' : 'animate-pulse'
            }`}
          >
            {justFinished ? '✓' : '✦'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">
              {justFinished ? t('generationBannerDone') : t('generationBannerTitle')}
            </p>
            {!justFinished && progress && (
              <p className="mt-0.5 text-xs text-ink-600">
                {t('generationBannerProgress', { generated: progress.pagesGenerated, total: progress.pagesTotal })}
              </p>
            )}
          </div>
          {!justFinished && (
            <button
              type="button"
              onClick={() => currentKey && setDismissedKey(currentKey)}
              aria-label={common('close')}
              className="focus-ring shrink-0 rounded-full p-1 text-ink-500 hover:bg-ink-100"
            >
              ✕
            </button>
          )}
        </div>
        {!justFinished && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-lagoon-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
