import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Deletes a child and every derived asset: story PDFs, page images, story
 * rows, consent history, and job records. Must be called with a
 * service-role client (see src/lib/supabase/service-role.ts) because it
 * needs to remove Storage objects, which RLS alone cannot cascade.
 *
 * Order matters: storage objects are removed BEFORE the database rows that
 * reference their paths, so a failed storage delete never leaves an
 * orphaned DB row pointing at nothing — but never leaves storage waiting on
 * a row that no longer exists to know its own retention window.
 */
export interface DeletionResult {
  childId: string;
  storiesDeleted: number;
  storageObjectsDeleted: number;
}

export async function deleteChildCascade(
  supabase: SupabaseClient,
  tenantId: string,
  childId: string,
): Promise<DeletionResult> {
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('id, pdf_asset_path')
    .eq('tenant_id', tenantId)
    .eq('child_id', childId);
  if (storiesError) throw storiesError;

  const storyIds = (stories ?? []).map((s) => s.id as string);

  const { data: pages, error: pagesError } = storyIds.length
    ? await supabase.from('story_pages').select('image_asset_path').in('story_id', storyIds)
    : { data: [], error: null };
  if (pagesError) throw pagesError;

  const assetPaths = [
    ...(stories ?? []).map((s) => s.pdf_asset_path).filter((p): p is string => Boolean(p)),
    ...(pages ?? []).map((p) => p.image_asset_path).filter((p): p is string => Boolean(p)),
  ];

  let storageObjectsDeleted = 0;
  if (assetPaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('story-assets').remove(assetPaths);
    if (removeError) throw removeError;
    storageObjectsDeleted = assetPaths.length;
  }

  // stories -> story_pages / story_jobs cascade via FK ON DELETE CASCADE;
  // consent_requests cascade via the same child_id FK.
  const { error: deleteChildError } = await supabase
    .from('children')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', childId);
  if (deleteChildError) throw deleteChildError;

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'child_deleted',
    target_type: 'child',
    target_id: childId,
    metadata: { stories_deleted: storyIds.length, storage_objects_deleted: storageObjectsDeleted },
  });

  return { childId, storiesDeleted: storyIds.length, storageObjectsDeleted };
}

/**
 * Called when a parent withdraws consent: keeps the child record (so the
 * nursery roster stays intact and re-consent is possible later) but
 * removes every generated story asset, since withdrawn consent means the
 * nursery no longer has a lawful basis to hold the generated material.
 */
export async function deleteStoryAssetsForChild(
  supabase: SupabaseClient,
  tenantId: string,
  childId: string,
): Promise<DeletionResult> {
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('id, pdf_asset_path')
    .eq('tenant_id', tenantId)
    .eq('child_id', childId);
  if (storiesError) throw storiesError;

  const storyIds = (stories ?? []).map((s) => s.id as string);
  const { data: pages } = storyIds.length
    ? await supabase.from('story_pages').select('image_asset_path').in('story_id', storyIds)
    : { data: [] };

  const assetPaths = [
    ...(stories ?? []).map((s) => s.pdf_asset_path).filter((p): p is string => Boolean(p)),
    ...(pages ?? []).map((p) => p.image_asset_path).filter((p): p is string => Boolean(p)),
  ];

  let storageObjectsDeleted = 0;
  if (assetPaths.length > 0) {
    const { error: removeError } = await supabase.storage.from('story-assets').remove(assetPaths);
    if (removeError) throw removeError;
    storageObjectsDeleted = assetPaths.length;
  }

  if (storyIds.length > 0) {
    const { error: deleteStoriesError } = await supabase.from('stories').delete().in('id', storyIds);
    if (deleteStoriesError) throw deleteStoriesError;
  }

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    action: 'consent_withdrawn_assets_deleted',
    target_type: 'child',
    target_id: childId,
    metadata: { stories_deleted: storyIds.length, storage_objects_deleted: storageObjectsDeleted },
  });

  return { childId, storiesDeleted: storyIds.length, storageObjectsDeleted };
}
