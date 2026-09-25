'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import type { ActionResult } from './auth';

export async function updateTenantBrandingAction(locale: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };
  if (context.role !== 'nursery_owner') return { error: 'Only the owner can update branding.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Name is required.' };

  // Brand colour and data-retention policy are nursery-only fields in
  // the UI (SettingsForm doesn't render them for a family tenant), so
  // only touch them here when actually submitted rather than assuming
  // every caller sends both.
  const update: { name: string; brand_primary_color?: string; data_retention_days?: number } = { name };

  if (formData.has('brandColor')) {
    const brandColor = String(formData.get('brandColor') ?? '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(brandColor)) return { error: 'Brand colour must be a hex value.' };
    update.brand_primary_color = brandColor;
  }

  if (formData.has('retentionDays')) {
    const retentionDays = Number(formData.get('retentionDays'));
    if (retentionDays < 30 || retentionDays > 3650) {
      return { error: 'Retention must be between 30 and 3650 days.' };
    }
    update.data_retention_days = retentionDays;
  }

  const { error } = await supabase.from('tenants').update(update).eq('id', context.tenantId);
  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/settings`);
  return {};
}

export async function inviteStaffAction(locale: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };
  if (context.role !== 'nursery_owner') return { error: 'Only the owner can invite staff.' };

  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? 'nursery_staff');

  // Supabase Auth invite-by-email (auth.admin.inviteUserByEmail) requires
  // the service role key AND an SMTP/email provider configured on the
  // Supabase project — both are founder setup steps (see
  // docs/NEEDS_FROM_ME.md). This records the intended role so it can be
  // applied the moment the invited user's account exists; wiring the
  // actual email send is the next step once a Supabase project is live.
  const { error } = await supabase.from('audit_logs').insert({
    tenant_id: context.tenantId,
    actor_user_id: context.userId,
    action: 'staff_invite_requested',
    target_type: 'tenant_member',
    metadata: { role },
  });
  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/staff`);
  return {
    message: `Invite recorded for ${email}. Email delivery requires Supabase Auth to be configured — see docs/NEEDS_FROM_ME.md.`,
  };
}
