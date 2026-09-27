'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { generateStaffInviteToken, buildStaffInviteUrl } from '@/lib/domain/staff-invites';
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

export interface InviteStaffResult extends ActionResult {
  inviteUrl?: string;
}

const INVITABLE_ROLES = ['nursery_admin', 'nursery_staff'] as const;

/**
 * Generates a shareable invite link rather than sending an email directly
 * -- auth.admin.inviteUserByEmail needs SMTP configured on the Supabase
 * project (a founder setup step), while a link the owner shares themself
 * (WhatsApp, email, in person -- their choice) needs nothing extra, same
 * reasoning as the referral/consent links elsewhere in this app. The
 * invited person sets their own password on the public accept page,
 * which calls accept_staff_invite to join THIS tenant -- never a new one,
 * see docs/DECISIONS.md "Staff invites: real accounts via a shareable
 * link, not email".
 */
export async function inviteStaffAction(locale: string, formData: FormData): Promise<InviteStaffResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };
  if (context.role !== 'nursery_owner') return { error: 'Only the owner can invite staff.' };

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? 'nursery_staff');
  if (!email) return { error: 'Email is required.' };
  if (!INVITABLE_ROLES.includes(role as (typeof INVITABLE_ROLES)[number])) {
    return { error: 'Invalid role.' };
  }

  const { token, tokenHash } = generateStaffInviteToken();
  const { error } = await supabase.from('staff_invites').insert({
    tenant_id: context.tenantId,
    email,
    role,
    token_hash: tokenHash,
    invited_by: context.userId,
  });
  if (error) return { error: error.message };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  revalidatePath(`/${locale}/dashboard/staff`);
  return { inviteUrl: buildStaffInviteUrl(baseUrl, locale, token) };
}
