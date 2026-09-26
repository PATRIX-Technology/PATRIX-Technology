import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { runWorkerOnce } from '@/lib/jobs/worker';

export const runtime = 'nodejs';
// Processing up to 50 jobs (real Gemini calls among them) can run well
// past Vercel's default — see the same reasoning as the child page's
// maxDuration. 300 is the Vercel Pro ceiling; the Hobby plan silently
// clamps this to its own 60s max.
export const maxDuration = 300;

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
