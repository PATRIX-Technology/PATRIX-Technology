import type { SupabaseClient } from '@supabase/supabase-js';
import { renderStoryPdf } from '@/lib/providers/pdf/render';
import { runPreflight, type PreflightIssue } from '@/lib/providers/pdf/preflight';
import { STORY_ASSETS_BUCKET } from '@/lib/domain/storage';
import type { TenantContext } from '@/lib/domain/session';
import { errorMessage } from '@/lib/errors';

export class PdfPreflightFailedError extends Error {
  constructor(public readonly issues: PreflightIssue[]) {
    super('PDF failed preflight validation.');
    this.name = 'PdfPreflightFailedError';
  }
}

export interface RenderedStoryPdf {
  pdfBytes: Uint8Array;
  assetPath: string;
  childName: string;
  fileName: string;
}

/**
 * Fetches an APPROVED story's pages + image assets, renders the print PDF,
 * runs preflight, and uploads the result. Shared by the single-story
 * download route and the class-level bulk ZIP route so both enforce the
 * exact same "never ship a PDF that fails preflight" guarantee.
 */
export async function renderApprovedStoryPdf(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  storyId: string,
  context: TenantContext,
): Promise<RenderedStoryPdf> {
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('*, children(first_name)')
    .eq('id', storyId)
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED')
    .maybeSingle();
  if (storyError) throw new Error(`Could not load story ${storyId}: ${errorMessage(storyError)}`);
  if (!story) throw new Error(`Story ${storyId} not found or not approved.`);

  const { data: pages } = await supabase
    .from('story_pages')
    .select('*')
    .eq('story_id', story.id)
    .order('page_number');

  const missingAssetPageNumbers = (pages ?? [])
    .filter((p) => p.image_status !== 'GENERATED' || !p.image_asset_path)
    .map((p) => p.page_number);

  const renderPages = await Promise.all(
    (pages ?? [])
      .filter((p) => p.image_asset_path)
      .map(async (p) => {
        const { data, error } = await supabase.storage
          .from(STORY_ASSETS_BUCKET)
          .download(p.image_asset_path!);
        if (error || !data) {
          throw new Error(`Could not download asset for page ${p.page_number}: ${error?.message}`);
        }
        return {
          pageNumber: p.page_number,
          text: p.text,
          imageBytes: new Uint8Array(await data.arrayBuffer()),
          imageContentType: data.type || 'image/png',
        };
      }),
  );

  const childName = (story.children as unknown as { first_name: string } | null)?.first_name ?? '';

  const pdfBytes = await renderStoryPdf({
    title: story.theme_key.replace(/_/g, ' '),
    childName,
    organisationName: context.tenantName,
    locale: story.locale,
    pages: renderPages,
  });

  const preflight = await runPreflight({
    pdfBytes,
    expectedPageCount: 2 + (pages ?? []).length,
    locale: story.locale,
    pageTexts: (pages ?? []).map((p) => p.text),
    missingAssetPageNumbers,
  });
  if (!preflight.ok) {
    throw new PdfPreflightFailedError(preflight.issues);
  }

  const assetPath = `${context.tenantId}/stories/${story.id}/print/story.pdf`;
  const { error: uploadError } = await serviceClient.storage
    .from(STORY_ASSETS_BUCKET)
    .upload(assetPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(`Could not save the rendered PDF: ${errorMessage(uploadError)}`);

  const { error: updateError } = await serviceClient
    .from('stories')
    .update({ pdf_asset_path: assetPath })
    .eq('id', story.id);
  if (updateError) throw new Error(`Could not record the PDF's location: ${errorMessage(updateError)}`);

  return {
    pdfBytes,
    assetPath,
    childName,
    fileName: `${childName || 'story'}-${story.theme_key}.pdf`,
  };
}
