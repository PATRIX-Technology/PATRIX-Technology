import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { renderApprovedStoryPdf } from '@/lib/domain/story-pdf';
import { buildBulkZip, sanitizeFileNamePart } from '@/lib/providers/pdf/bulk-zip';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
// Rendering every approved story in a class sequentially can easily run
// past Vercel's 10s default — see the same reasoning on the single-story
// PDF route.
export const maxDuration = 60;

/**
 * Bulk class-level export: every APPROVED story for children in the given
 * class, zipped into one download for a nursery admin. See
 * docs/TEST_CHECKLIST.md for the manual test of this flow.
 */
export async function GET(_request: Request, { params }: { params: { className: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const className = decodeURIComponent(params.className);

  const { data: children } = await supabase
    .from('children')
    .select('id, first_name')
    .eq('tenant_id', context.tenantId)
    .eq('class_name', className);

  if (!children || children.length === 0) {
    return NextResponse.json({ error: 'No children found in this class.' }, { status: 404 });
  }

  const { data: stories } = await supabase
    .from('stories')
    .select('id, child_id')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED')
    .in(
      'child_id',
      children.map((c) => c.id),
    );

  if (!stories || stories.length === 0) {
    return NextResponse.json({ error: 'No approved stories found for this class yet.' }, { status: 404 });
  }

  const serviceClient = createSupabaseServiceRoleClient();
  const entries = [];
  const failures: { storyId: string; error: string }[] = [];

  for (const story of stories) {
    try {
      const rendered = await renderApprovedStoryPdf(supabase, serviceClient, story.id, context);
      entries.push({ fileName: sanitizeFileNamePart(rendered.childName) + '.pdf', pdfBytes: rendered.pdfBytes });
    } catch (error) {
      failures.push({ storyId: story.id, error: errorMessage(error) });
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No stories could be exported.', failures }, { status: 422 });
  }

  const zipBuffer = await buildBulkZip(entries);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${sanitizeFileNamePart(className)}-stories.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
