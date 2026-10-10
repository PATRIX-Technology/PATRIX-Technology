import { NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { runRetentionSweepOnce } from '@/lib/jobs/retention';
import { isCronRequestAuthorized } from '@/lib/domain/cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Scheduled entry point for enforcing tenants.data_retention_days — see
 * src/lib/jobs/retention.ts for why this exists. Hit daily by
 * .github/workflows/retention-sweep-cron.yml with CRON_SECRET, same
 * pattern as /api/cron/worker.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  if (!isCronRequestAuthorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const result = await runRetentionSweepOnce(supabase);
  return NextResponse.json(result);
}
