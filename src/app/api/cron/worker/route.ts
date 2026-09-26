import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { runWorkerOnce } from '@/lib/jobs/worker';

export const runtime = 'nodejs';
// 60 is the Hobby plan's ceiling for this config value — see
// docs/DECISIONS.md "maxDuration must not exceed the Hobby ceiling".
export const maxDuration = 60;

/**
 * Scheduled entry point for the story-generation job queue. Configure your
 * host's cron (Vercel Cron, a GitHub Actions schedule, etc.) to hit this
 * every 1-2 minutes with the CRON_SECRET below — see docs/HANDOFF.md
 * "Deploying" for exact setup. Server actions also call runWorkerOnce
 * synchronously after creating a story so demo/dev usage feels instant;
 * this route is what keeps the queue moving in production if that inline
 * call fails or the process restarts mid-job.
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
