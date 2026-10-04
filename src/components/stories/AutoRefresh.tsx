'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { kickStoryWorkerAction } from '@/lib/actions/stories';

/** Polls the server component above it by re-fetching this route every
 * few seconds, so a parent/staff member watching the story generate sees
 * new page images appear without manually refreshing. Stops once the
 * caller says there's nothing left to wait for.
 *
 * Also nudges the generation queue forward on every tick (and once on
 * mount) via kickStoryWorkerAction — the story page itself used to do
 * this synchronously during its own render, which repeatedly re-exposed
 * the page to Vercel's 60s function ceiling and crashed on a real
 * multi-page story. Calling it here instead, from client-side JS, means
 * a slow or failed kick only fails this one fetch (caught below, silently
 * retried next tick) and can never crash the page itself. The scheduled
 * cron remains the fallback for when nobody has this page open, but its
 * own schedule trigger is best-effort and has been observed delayed by
 * hours in production — this is the fast, reliable path whenever a real
 * person is actually watching. */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    async function tick() {
      // A phone backgrounding this tab (switching apps, locking the
      // screen) suspends its network connections -- a tick in flight
      // at that moment, or firing while hidden, previously could reject
      // with a bare "TypeError: network error" the moment the tab came
      // back. router.refresh() sat OUTSIDE the try/catch below, so that
      // rejection went uncaught and crashed the whole page to the
      // nearest error boundary (error.tsx) until a manual refresh.
      // Skipping the tick entirely while hidden, and catching
      // router.refresh() too, closes both paths.
      if (document.visibilityState !== 'visible') return;
      try {
        await kickStoryWorkerAction();
        if (!cancelled) router.refresh();
      } catch {
        // Best-effort — the next tick, or the scheduled cron, retries.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') tick();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, intervalMs, router]);

  return null;
}
