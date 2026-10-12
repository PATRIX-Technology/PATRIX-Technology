import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Only ever call this from:
 *   - the job worker (src/lib/jobs/worker.ts)
 *   - Stripe webhook handlers
 *   - scripts/*.mjs (seeding)
 *   - a server action that already re-verified `is_platform_owner` on the
 *     caller's own session first, for a write RLS has no policy for at
 *     all (e.g. updatePrintOrderBatchStatusAction advancing
 *     print_orders.status -- see supabase/migrations/0037_print_orders.sql's
 *     own comment on why that table has no authenticated UPDATE policy)
 *
 * Never import this into any code that runs in, or could be bundled for,
 * the browser — the `server-only` import above makes that a build error.
 * Never pass tenant-scoped filtering decisions to the caller of a
 * service-role query without re-validating the tenant_id server-side.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are not configured.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
