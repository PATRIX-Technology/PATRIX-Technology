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
  // children!stories_child_id_fkey disambiguates the embed -- see the
  // fuller note in stories/[storyId]/page.tsx. Without it this query
  // silently errored for every PDF/ZIP download, surfacing only as the
  // generic "Could not load story" thrown below.
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('*, children!stories_child_id_fkey(first_name, arabic_first_name)')
    .eq('id', storyId)
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED')
    .maybeSingle();
  if (storyError) throw new Error(`Could not load story ${storyId}: ${errorMessage(storyError)}`);
  if (!story) throw new Error(`Story ${storyId} not found or not approved.`);

  // The printed title must be the template's real title — never the raw
  // snake_case theme_key, which is always English regardless of the
  // story's own locale (an Arabic booklet printed with an English title
  // would be exactly the kind of language mismatch this repo has spent
  // real effort eliminating everywhere else — see docs/DECISIONS.md
  // "Arabic gender-agreement audit of the story templates").
  const { data: templateRow } = await supabase
    .from('story_theme_templates')
    .select('title')
    .eq('theme_key', story.theme_key)
    .eq('locale', story.locale)
    .maybeSingle();

  // Cover/back pages are always bilingual regardless of the story's own
  // locale (docs/DECISIONS.md "6-page structure: cover + back page"), so
  // both title rows are needed here even though only one is the story's
  // primary locale above.
  const { data: templateRows } = await supabase
    .from('story_theme_templates')
    .select('title, locale')
    .eq('theme_key', story.theme_key)
    .in('locale', ['en', 'ar']);
  const titleEn = templateRows?.find((t) => t.locale === 'en')?.title ?? templateRow?.title ?? story.theme_key.replace(/_/g, ' ');
  const titleAr = templateRows?.find((t) => t.locale === 'ar')?.title ?? titleEn;

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

  const child = story.children as unknown as { first_name: string; arabic_first_name: string | null } | null;
  const childName = (story.locale === 'ar' && child?.arabic_first_name) || child?.first_name || '';
  const childNameEn = child?.first_name || '';
  const childNameAr = child?.arabic_first_name || childNameEn;

  // The nursery's own logo (optional, uploaded in Settings) -- fetched with
  // the caller's own RLS-governed client, same as the page images above, so
  // no new Storage policy is needed. Never let a missing/unreadable logo
  // fail the whole PDF: a story still renders fine without one.
  let logoBytes: Uint8Array | undefined;
  let logoContentType: string | undefined;
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('logo_asset_path')
    .eq('id', context.tenantId)
    .maybeSingle();
  if (tenantRow?.logo_asset_path) {
    const { data: logoData } = await supabase.storage.from(STORY_ASSETS_BUCKET).download(tenantRow.logo_asset_path);
    if (logoData) {
      logoBytes = new Uint8Array(await logoData.arrayBuffer());
      logoContentType = logoData.type || 'image/png';
    }
  }

  const pdfBytes = await renderStoryPdf({
    title: templateRow?.title ?? story.theme_key.replace(/_/g, ' '),
    childName,
    titleEn,
    titleAr,
    childNameEn,
    childNameAr,
    organisationName: context.tenantName,
    locale: story.locale,
    pages: renderPages,
    logoBytes,
    logoContentType,
  });

  // Preflight's expected page count now includes the templated cover +
  // back pages added in render.ts (docs/DECISIONS.md "6-page structure:
  // cover + back page") — they're real pages in the output PDF even
  // though they aren't rows in story_pages.
  const preflight = await runPreflight({
    pdfBytes,
    expectedPageCount: (pages ?? []).length + 2,
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
