'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { ChildFormSchema, parseChildrenCsv } from '@/lib/domain/children';
import { DEFAULT_AVATAR_CONFIG } from '@/lib/domain/avatar';
import { generateConsentToken } from '@/lib/domain/consent';
import { deleteChildCascade, deleteStoryAssetsForChild } from '@/lib/domain/deletion';
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

export async function requestConsentAction(locale: string, childId: string): Promise<RequestConsentResult> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return { error: 'Not signed in.' };

  const { token, tokenHash } = generateConsentToken();
  const { error } = await supabase.from('consent_requests').insert({
    tenant_id: context.tenantId,
    child_id: childId,
    token_hash: tokenHash,
    requested_by: context.userId,
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

  // Withdrawal removes any generated story assets for this child — this
  // needs the service-role client because it deletes Storage objects,
  // which RLS alone cannot cascade (see src/lib/domain/deletion.ts).
  const context = await getCurrentTenantContext(supabase);
  if (context) {
    const serviceClient = createSupabaseServiceRoleClient();
    await deleteStoryAssetsForChild(serviceClient, context.tenantId, childId);
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
