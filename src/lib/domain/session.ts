import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantRole } from '@/types/database';

export interface TenantContext {
  userId: string;
  fullName: string;
  isPlatformOwner: boolean;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
}

/**
 * Loads the signed-in user's profile plus their FIRST tenant membership.
 * Multi-tenant users (e.g. a consultant helping several nurseries) are out
 * of scope for the MVP — see docs/DECISIONS.md "Single active tenant per
 * session". Returns null if the user has no tenant yet (mid-onboarding).
 */
export async function getCurrentTenantContext(supabase: SupabaseClient): Promise<TenantContext | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, is_platform_owner')
    .eq('id', user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from('tenant_members')
    .select('tenant_id, role, tenants(name, slug)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const tenant = membership.tenants as unknown as { name: string; slug: string } | null;

  return {
    userId: user.id,
    fullName: profile?.full_name ?? user.email ?? 'User',
    isPlatformOwner: profile?.is_platform_owner ?? false,
    tenantId: membership.tenant_id,
    tenantName: tenant?.name ?? 'Organisation',
    tenantSlug: tenant?.slug ?? '',
    role: membership.role,
  };
}
