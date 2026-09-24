'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Polls the server component above it by re-fetching this route every
 * few seconds, so a parent/staff member watching the story generate sees
 * new page images appear without manually refreshing. Stops once the
 * caller says there's nothing left to wait for. */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
