'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { generateStaffInviteToken, buildStaffInviteUrl } from '@/lib/domain/staff-invites';
import { sniffImageMimeType } from '@/lib/domain/children';
import { STORY_ASSETS_BUCKET } from '@/lib/domain/storage';
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

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB -- a logo badge is drawn small, no need for anything larger

/**
 * Uploads a nursery's own logo, drawn as a small corner badge on every
 * story PDF their children's stories generate (see
 * src/lib/providers/pdf/render.ts) -- an optional branding touch, not a
 * personalisation feature, so it carries none of the consent/opt-in
 * machinery uploadChildPhotoAction has. Owner-only, same as the rest of
 * branding, so a staff member can't change what goes out under the
 * nursery's name.
 */
export async function uploadTenantLogoAction(locale: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };
  if (context.role !== 'nursery_owner') return { error: 'Only the owner can update branding.' };

  const file = formData.get('logo');
  if (!(file instanceof File)) return { error: 'No logo provided.' };
  if (file.size > MAX_LOGO_BYTES) {
    return { error: 'Logo must be smaller than 2MB.' };
  }

  // Same reasoning as uploadChildPhotoAction: file.type is client-claimed
  // and trivially spoofable, so the real decision is made from the bytes.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffedType = sniffImageMimeType(bytes);
  if (!sniffedType) {
    return { error: 'Please upload a JPEG, PNG, or WEBP image.' };
  }

  const extension = sniffedType === 'image/png' ? 'png' : sniffedType === 'image/webp' ? 'webp' : 'jpg';
  const assetPath = `${context.tenantId}/branding/logo.${extension}`;

  const serviceClient = createSupabaseServiceRoleClient();
  const { error: uploadError } = await serviceClient.storage
    .from(STORY_ASSETS_BUCKET)
    .upload(assetPath, bytes, { contentType: sniffedType, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase
    .from('tenants')
    .update({ logo_asset_path: assetPath })
    .eq('id', context.tenantId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/${locale}/dashboard/settings`);
  return {};
}

export async function removeTenantLogoAction(locale: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };
  if (context.role !== 'nursery_owner') return { error: 'Only the owner can update branding.' };

  const { data: tenant } = await supabase
    .from('tenants')
    .select('logo_asset_path')
    .eq('id', context.tenantId)
    .maybeSingle();
  if (tenant?.logo_asset_path) {
    const serviceClient = createSupabaseServiceRoleClient();
    await serviceClient.storage.from(STORY_ASSETS_BUCKET).remove([tenant.logo_asset_path]);
  }

  const { error } = await supabase.from('tenants').update({ logo_asset_path: null }).eq('id', context.tenantId);
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
