'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { ChildFormSchema, parseChildrenCsv } from '@/lib/domain/children';
import { DEFAULT_AVATAR_CONFIG } from '@/lib/domain/avatar';
import { buildConsentScope, generateConsentToken } from '@/lib/domain/consent';
import { deleteChildCascade, deleteStoryAssetsForChild, deleteChildPhoto } from '@/lib/domain/deletion';
import { flags } from '@/lib/flags';
import { STORY_ASSETS_BUCKET } from '@/lib/domain/storage';
import type { ActionResult } from './auth';

export async function addChildAction(locale: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  let avatarConfig: unknown = DEFAULT_AVATAR_CONFIG;
  const avatarConfigRaw = formData.get('avatarConfig');
  if (typeof avatarConfigRaw === 'string' && avatarConfigRaw.length > 0) {
    try {
      avatarConfig = JSON.parse(avatarConfigRaw);
    } catch {
      // fall back to the default below via schema validation
    }
  }

  const parsed = ChildFormSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || undefined,
    arabicFirstName: formData.get('arabicFirstName') || undefined,
    arabicLastName: formData.get('arabicLastName') || undefined,
    pronoun: formData.get('pronoun'),
    className: formData.get('className') || undefined,
    preferredLanguage: formData.get('preferredLanguage'),
    avatarConfig,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { error } = await supabase.from('children').insert({
    tenant_id: context.tenantId,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName || null,
    arabic_first_name: parsed.data.arabicFirstName || null,
    arabic_last_name: parsed.data.arabicLastName || null,
    pronoun: parsed.data.pronoun,
    class_name: parsed.data.className || null,
    preferred_language: parsed.data.preferredLanguage,
    avatar_config: parsed.data.avatarConfig,
    created_by: context.userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/children`);
  return {};
}

/**
 * Updates a child's editable profile fields (names, pronoun, class,
 * preferred language, avatar) — everything the add-child form collects,
 * minus fields with their own dedicated flows (consent, photo).
 */
export async function updateChildAction(
  locale: string,
  childId: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  let avatarConfig: unknown = DEFAULT_AVATAR_CONFIG;
  const avatarConfigRaw = formData.get('avatarConfig');
  if (typeof avatarConfigRaw === 'string' && avatarConfigRaw.length > 0) {
    try {
      avatarConfig = JSON.parse(avatarConfigRaw);
    } catch {
      // fall back to the default below via schema validation
    }
  }

  const parsed = ChildFormSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || undefined,
    arabicFirstName: formData.get('arabicFirstName') || undefined,
    arabicLastName: formData.get('arabicLastName') || undefined,
    pronoun: formData.get('pronoun'),
    className: formData.get('className') || undefined,
    preferredLanguage: formData.get('preferredLanguage'),
    avatarConfig,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { error } = await supabase
    .from('children')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName || null,
      arabic_first_name: parsed.data.arabicFirstName || null,
      arabic_last_name: parsed.data.arabicLastName || null,
      pronoun: parsed.data.pronoun,
      class_name: parsed.data.className || null,
      preferred_language: parsed.data.preferredLanguage,
      avatar_config: parsed.data.avatarConfig,
    })
    .eq('id', childId)
    .eq('tenant_id', context.tenantId);
  if (error) return { error: error.message };

  revalidatePath(`/${locale}/dashboard/children`);
  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  return {};
}

export interface ImportCsvResult extends ActionResult {
  imported?: number;
  rowErrors?: { row: number; errors: string[] }[];
}

export async function importChildrenCsvAction(locale: string, formData: FormData): Promise<ImportCsvResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file uploaded.' };

  const content = await file.text();
  const { results, headerError } = parseChildrenCsv(content);
  if (headerError) return { error: headerError };

  const validRows = results.filter((r) => r.data);
  const rowErrors = results
    .filter((r) => r.errors)
    .map((r) => ({ row: r.row, errors: r.errors! }));

  if (validRows.length > 0) {
    const { error } = await supabase.from('children').insert(
      validRows.map((r) => ({
        tenant_id: context.tenantId,
        first_name: r.data!.firstName,
        last_name: r.data!.lastName || null,
        arabic_first_name: r.data!.arabicFirstName || null,
        arabic_last_name: r.data!.arabicLastName || null,
        pronoun: r.data!.pronoun,
        class_name: r.data!.className || null,
        preferred_language: r.data!.preferredLanguage,
        avatar_config: DEFAULT_AVATAR_CONFIG,
        created_by: context.userId,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath(`/${locale}/dashboard/children`);
  return { imported: validRows.length, rowErrors: rowErrors.length > 0 ? rowErrors : undefined };
}

export interface RequestConsentResult extends ActionResult {
  consentUrl?: string;
}

export async function requestConsentAction(
  locale: string,
  childId: string,
  includePhotoRequest = false,
): Promise<RequestConsentResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const { data: tenant } = await supabase
    .from('tenants')
    .select('photo_personalization_opt_in')
    .eq('id', context.tenantId)
    .maybeSingle();

  const scope = buildConsentScope({
    requestPhoto: includePhotoRequest,
    tenantOptedIntoPhoto: tenant?.photo_personalization_opt_in ?? false,
    legalReviewCompleted: flags.photoPersonalizationLegalReviewComplete,
  });

  const { token, tokenHash } = generateConsentToken();
  const { error } = await supabase.from('consent_requests').insert({
    tenant_id: context.tenantId,
    child_id: childId,
    token_hash: tokenHash,
    requested_by: context.userId,
    scope,
  });
  if (error) return { error: error.message };

  await supabase.from('children').update({ consent_status: 'pending' }).eq('id', childId);

  const baseUrl = process.env.CONSENT_LINK_BASE_URL ?? 'http://localhost:3000/consent';
  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  return { consentUrl: `${baseUrl.replace(/\/$/, '')}/${token}` };
}

export async function withdrawConsentAction(locale: string, childId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('withdraw_consent', { target_child_id: childId });
  if (error) return { error: error.message };

  // Withdrawal removes any generated story assets for this child, AND any
  // uploaded reference photo (photo consent is part of what was just
  // withdrawn) — needs the service-role client because it deletes
  // Storage objects, which RLS alone cannot cascade (see
  // src/lib/domain/deletion.ts).
  const context = await getCurrentTenantContext(supabase);
  if (context) {
    const serviceClient = createSupabaseServiceRoleClient();
    await deleteStoryAssetsForChild(serviceClient, context.tenantId, childId);
    await deleteChildPhoto(serviceClient, context.tenantId, childId);
  }

  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  return {};
}

export async function deleteChildAction(locale: string, childId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };
  if (context.role !== 'nursery_owner' && context.role !== 'nursery_admin') {
    return { error: 'Only an owner or admin can delete a child.' };
  }

  const serviceClient = createSupabaseServiceRoleClient();
  try {
    await deleteChildCascade(serviceClient, context.tenantId, childId);
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath(`/${locale}/dashboard/children`);
  return {};
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Uploads a reference photo for photo-based story personalisation.
 * Refuses unless ALL FIVE conditions from the product brief hold:
 * feature flag on, legal-review flag on, tenant opted in, a consent
 * request for this child is granted, and that consent's scope actually
 * covers photo use. See docs/DECISIONS.md "Photo personalisation wiring".
 */
export async function uploadChildPhotoAction(locale: string, formData: FormData): Promise<ActionResult> {
  if (!flags.photoPersonalization) {
    return { error: 'Photo personalisation is not enabled on this deployment.' };
  }
  if (!flags.photoPersonalizationLegalReviewComplete) {
    return { error: 'Photo personalisation cannot be used until legal review is complete.' };
  }

  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const childId = String(formData.get('childId') ?? '');
  const file = formData.get('photo');
  if (!childId || !(file instanceof File)) return { error: 'No photo provided.' };
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
    return { error: 'Please upload a JPEG, PNG, or WEBP image.' };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: 'Photo must be smaller than 8MB.' };
  }

  const { data: hasConsent, error: consentError } = await supabase.rpc('has_granted_photo_consent', {
    target_child_id: childId,
  });
  if (consentError) return { error: consentError.message };

  if (context.tenantType === 'family') {
    // A family tenant has no separate parent to ask — the account owner
    // IS the child's parent/guardian — so there's no per-tenant opt-in
    // toggle and no multi-party request/wait/respond flow to go through.
    // Instead, the single required checkbox on the upload form itself
    // (see PhotoUpload.tsx requireFamilyConsentCheckbox) grants a
    // consent_requests row atomically with this same upload, the first
    // time only. See docs/DECISIONS.md "Family photo consent: a single
    // checkbox at upload time".
    if (!hasConsent) {
      if (formData.get('familyPhotoConsent') !== 'on') {
        return { error: 'Please check the consent box to upload a photo.' };
      }
      const { tokenHash } = generateConsentToken();
      const { error: grantError } = await supabase.from('consent_requests').insert({
        tenant_id: context.tenantId,
        child_id: childId,
        token_hash: tokenHash,
        scope: { story: true, photo: true },
        status: 'granted',
        requested_by: context.userId,
        responded_at: new Date().toISOString(),
      });
      if (grantError) return { error: grantError.message };
    }
  } else {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('photo_personalization_opt_in')
      .eq('id', context.tenantId)
      .maybeSingle();
    if (!tenant?.photo_personalization_opt_in) {
      return { error: 'This organisation has not opted in to photo personalisation — see Settings.' };
    }
    if (!hasConsent) {
      return {
        error:
          "This child's parent has not granted consent for photo use yet — request photo consent first.",
      };
    }
  }

  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const assetPath = `${context.tenantId}/children/${childId}/photo.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const serviceClient = createSupabaseServiceRoleClient();
  const { error: uploadError } = await serviceClient.storage
    .from(STORY_ASSETS_BUCKET)
    .upload(assetPath, bytes, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase
    .from('children')
    .update({ photo_asset_path: assetPath })
    .eq('id', childId);
  if (updateError) return { error: updateError.message };

  await serviceClient.from('audit_logs').insert({
    tenant_id: context.tenantId,
    actor_user_id: context.userId,
    action: 'child_photo_uploaded',
    target_type: 'child',
    target_id: childId,
    metadata: {},
  });

  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  return {};
}

export async function removeChildPhotoAction(locale: string, childId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const serviceClient = createSupabaseServiceRoleClient();
  await deleteChildPhoto(serviceClient, context.tenantId, childId);

  revalidatePath(`/${locale}/dashboard/children/${childId}`);
  return {};
}
