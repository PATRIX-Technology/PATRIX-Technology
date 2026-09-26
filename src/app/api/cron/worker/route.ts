import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { runWorkerOnce } from '@/lib/jobs/worker';

export const runtime = 'nodejs';
// 60 is the Hobby plan's ceiling for this config value — see
// docs/DECISIONS.md "maxDuration must not exceed the Hobby ceiling".
export const maxDuration = 60;

/**
 * Scheduled entry point for the story-generation job queue. A GitHub
 * Actions workflow (.github/workflows/story-worker-cron.yml) hits this
 * every 5 minutes with the CRON_SECRET below — set up because Vercel's
 * own native Cron restricts free/Hobby plans to once a day, which is
 * useless for this. Server actions also call runWorkerOnce
 * synchronously right after creating a story so it normally finishes
 * within that same request; this route is the safety net that keeps
 * the queue moving for anything that gets orphaned in QUEUED/GENERATING
 * status instead — most likely a real (non-mock) multi-page generation
 * that ran long enough to hit Vercel's function timeout mid-request.
 * See docs/DECISIONS.md "Defending against a mid-generation function
 * timeout".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const result = await runWorkerOnce(supabase, 50);
  return NextResponse.json(result);
}
