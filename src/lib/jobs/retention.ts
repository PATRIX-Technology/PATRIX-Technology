import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteChildCascade } from '@/lib/domain/deletion';
import { errorMessage } from '@/lib/errors';

export interface RetentionSweepResult {
  tenantsScanned: number;
  childrenScanned: number;
  childrenDeleted: number;
  errors: Array<{ childId: string; tenantId: string; error: string }>;
}

interface RetentionCandidateRow {
  id: string;
  tenant_id: string;
  created_at: string;
  tenants: { data_retention_days: number } | { data_retention_days: number }[];
}

/**
 * Enforces `tenants.data_retention_days` — the column Privacy_Policy.md
 * section 7 and the in-app Legal page promise is actually acted on
 * ("child and story data is scheduled for deletion once that period
 * elapses"), not just a number sitting in Settings. Before this job
 * existed, nothing read the column back; see docs/DECISIONS.md "Retention
 * sweep: enforcing data_retention_days" for how that gap was found.
 *
 * Must run with a service-role client: it needs to see every tenant's
 * children to decide what's due, and deleteChildCascade needs Storage
 * access RLS alone can't grant.
 */
export async function runRetentionSweepOnce(supabase: SupabaseClient): Promise<RetentionSweepResult> {
  const { data: rows, error } = await supabase
    .from('children')
    .select('id, tenant_id, created_at, tenants!inner(data_retention_days)');
  if (error) throw error;

  const candidates = (rows ?? []) as unknown as RetentionCandidateRow[];
  const now = Date.now();

  const due = candidates.filter((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const retentionDays = tenant?.data_retention_days;
    if (!retentionDays) return false;
    const ageMs = now - new Date(row.created_at).getTime();
    return ageMs > retentionDays * 24 * 60 * 60 * 1000;
  });

  const result: RetentionSweepResult = {
    tenantsScanned: new Set(candidates.map((row) => row.tenant_id)).size,
    childrenScanned: candidates.length,
    childrenDeleted: 0,
    errors: [],
  };

  for (const row of due) {
    try {
      await deleteChildCascade(supabase, row.tenant_id, row.id);
      result.childrenDeleted += 1;
    } catch (err) {
      result.errors.push({ childId: row.id, tenantId: row.tenant_id, error: errorMessage(err) });
    }
  }

  return result;
}
