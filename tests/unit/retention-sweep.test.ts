import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runRetentionSweepOnce } from '@/lib/jobs/retention';
import { deleteChildCascade } from '@/lib/domain/deletion';

vi.mock('@/lib/domain/deletion', () => ({
  deleteChildCascade: vi.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

interface FakeRow {
  id: string;
  tenant_id: string;
  created_at: string;
  tenants: { data_retention_days: number };
}

function fakeSupabase(rows: FakeRow[]): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  } as unknown as SupabaseClient;
}

/**
 * Unit coverage for the date-math and per-tenant logic in
 * src/lib/jobs/retention.ts, mocking deleteChildCascade itself (that
 * function's own storage/cascade behaviour isn't this test's concern,
 * and nothing in this repo's integration harness runs a real
 * supabase-js client against PostgREST — see tests/integration/db/setup.ts).
 */
describe('runRetentionSweepOnce', () => {
  beforeEach(() => {
    vi.mocked(deleteChildCascade).mockReset();
    vi.mocked(deleteChildCascade).mockResolvedValue({
      childId: 'x',
      storiesDeleted: 0,
      storageObjectsDeleted: 0,
    });
  });

  it('deletes a child whose age exceeds their tenant\'s retention window', async () => {
    const old = new Date(Date.now() - 800 * DAY_MS).toISOString();
    const supabase = fakeSupabase([
      { id: 'child-1', tenant_id: 'tenant-1', created_at: old, tenants: { data_retention_days: 730 } },
    ]);

    const result = await runRetentionSweepOnce(supabase);

    expect(deleteChildCascade).toHaveBeenCalledWith(supabase, 'tenant-1', 'child-1');
    expect(result.childrenDeleted).toBe(1);
    expect(result.childrenScanned).toBe(1);
  });

  it('leaves a child within their tenant\'s retention window untouched', async () => {
    const recent = new Date(Date.now() - 10 * DAY_MS).toISOString();
    const supabase = fakeSupabase([
      { id: 'child-2', tenant_id: 'tenant-2', created_at: recent, tenants: { data_retention_days: 730 } },
    ]);

    const result = await runRetentionSweepOnce(supabase);

    expect(deleteChildCascade).not.toHaveBeenCalled();
    expect(result.childrenDeleted).toBe(0);
  });

  it('respects each tenant\'s own configured retention window, not a shared default', async () => {
    const ageMs = 40 * DAY_MS;
    const supabase = fakeSupabase([
      {
        id: 'child-short',
        tenant_id: 'tenant-short',
        created_at: new Date(Date.now() - ageMs).toISOString(),
        tenants: { data_retention_days: 30 },
      },
      {
        id: 'child-long',
        tenant_id: 'tenant-long',
        created_at: new Date(Date.now() - ageMs).toISOString(),
        tenants: { data_retention_days: 730 },
      },
    ]);

    const result = await runRetentionSweepOnce(supabase);

    expect(deleteChildCascade).toHaveBeenCalledTimes(1);
    expect(deleteChildCascade).toHaveBeenCalledWith(supabase, 'tenant-short', 'child-short');
    expect(result.childrenDeleted).toBe(1);
  });

  it('continues past a failed deletion and reports it instead of throwing', async () => {
    vi.mocked(deleteChildCascade)
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValueOnce({ childId: 'child-b', storiesDeleted: 0, storageObjectsDeleted: 0 });
    const old = new Date(Date.now() - 800 * DAY_MS).toISOString();
    const supabase = fakeSupabase([
      { id: 'child-a', tenant_id: 'tenant-a', created_at: old, tenants: { data_retention_days: 730 } },
      { id: 'child-b', tenant_id: 'tenant-b', created_at: old, tenants: { data_retention_days: 730 } },
    ]);

    const result = await runRetentionSweepOnce(supabase);

    expect(result.childrenDeleted).toBe(1);
    expect(result.errors).toEqual([{ childId: 'child-a', tenantId: 'tenant-a', error: 'storage down' }]);
  });
});
