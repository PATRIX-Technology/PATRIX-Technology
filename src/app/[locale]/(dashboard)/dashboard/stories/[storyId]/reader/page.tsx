import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getSignedAssetUrls } from '@/lib/domain/storage';
import { ReaderClient } from '@/components/reader/ReaderClient';

export default async function StoryReaderPage({
  params,
}: {
  params: { locale: string; storyId: string };
}) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data: story } = await supabase
    .from('stories')
    .select('*, children(first_name)')
    .eq('id', params.storyId)
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED')
    .maybeSingle();
  if (!story) notFound();

  const { data: pages } = await supabase
    .from('story_pages')
    .select('*')
    .eq('story_id', story.id)
    .order('page_number');

  const assetPaths = (pages ?? []).map((p) => p.image_asset_path).filter((p): p is string => Boolean(p));
  const signedUrls = await getSignedAssetUrls(supabase, assetPaths);

  const readerPages = (pages ?? []).map((p) => ({
    pageNumber: p.page_number,
    text: p.text,
    imageUrl: p.image_asset_path ? signedUrls[p.image_asset_path] ?? null : null,
  }));

  const childName = (story.children as unknown as { first_name: string } | null)?.first_name ?? '';

  return (
    <ReaderClient
      locale={params.locale}
      title={`${story.theme_key.replace(/_/g, ' ')} — ${childName}`}
      readerLocale={story.locale}
      pages={readerPages}
    />
  );
}
