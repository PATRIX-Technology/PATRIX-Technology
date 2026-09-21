import type { SupabaseClient } from '@supabase/supabase-js';

export const STORY_ASSETS_BUCKET = 'story-assets';
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * All story/child assets live in a PRIVATE Storage bucket. Every URL handed
 * to a browser is short-lived and signed, never a public/permanent link —
 * see docs/DECISIONS.md "Private storage + signed URLs".
 */
export async function getSignedAssetUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(STORY_ASSETS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

export async function getSignedAssetUrls(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(STORY_ASSETS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};

  const result: Record<string, string> = {};
  for (const entry of data) {
    if (entry.signedUrl && !entry.error) {
      result[entry.path ?? ''] = entry.signedUrl;
    }
  }
  return result;
}
