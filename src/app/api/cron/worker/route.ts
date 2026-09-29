import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { runWorkerOnce } from '@/lib/jobs/worker';
import { isCronRequestAuthorized } from '@/lib/domain/cron';

export const runtime = 'nodejs';
// 60 is the Hobby plan's ceiling for this config value — see
// docs/DECISIONS.md "maxDuration must not exceed the Hobby ceiling".
export const maxDuration = 60;

/**
 * Scheduled entry point for the story-generation job queue. A GitHub
 * Actions workflow (.github/workflows/story-worker-cron.yml) hits this
 * every 5 minutes with the CRON_SECRET below — set up because Vercel's
 * own native Cron restricts free/Hobby plans to once a day, which is
 * useless for this. kickStoryWorkerAction (a Server Action, called from
 * the browser by AutoRefresh while a story page is open) is the fast
 * path that normally drives the queue; this route is the safety net for
 * anything that gets orphaned in QUEUED/GENERATING status when nobody
 * has a story page open — including a job a previous invocation of
 * either path claimed but couldn't finish before its own deadline, see
 * runWorkerOnce's deadlineMs. See docs/DECISIONS.md "Defending against a
 * mid-generation function timeout".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // A missing secret used to fail OPEN (the `secret &&` short-circuit
  // skipped the check entirely), leaving this route unauthenticated —
  // anyone could trigger it. It's a required secret, not an optional
  // one: fail closed instead.
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  if (!isCronRequestAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const result = await runWorkerOnce(supabase, 50);
  return NextResponse.json(result);
}
