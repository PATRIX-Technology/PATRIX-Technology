import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { renderApprovedStoryPdf } from '@/lib/domain/story-pdf';
import { buildBulkZip, buildExportPlan } from '@/lib/providers/pdf/bulk-zip';
import { errorMessage } from '@/lib/errors';
import { contentDispositionHeader } from '@/lib/http/content-disposition';

export const runtime = 'nodejs';
// 60 is the Hobby plan's ceiling for this config value — see
// docs/DECISIONS.md "maxDuration must not exceed the Hobby ceiling".
export const maxDuration = 60;

/**
 * Export every APPROVED story as one ZIP, folder per class (see
 * buildExportPlan for the exact naming rules) -- the whole tenant by
 * default, or just the specific stories named in `?ids=` (comma-
 * separated story ids), which is how the stories list's "Select" mode
 * downloads a hand-picked subset (any mix of children) instead of
 * everything. `ids` is never trusted on its own: the stories query below
 * still scopes to `tenant_id` and `status = APPROVED` regardless of what
 * was requested, so a story id from another tenant or a non-approved one
 * is silently dropped rather than leaking across tenants.
 */
export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const idsParam = request.nextUrl.searchParams.get('ids');
  const requestedIds = idsParam
    ? idsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : null;

  const { data: children } = await supabase
    .from('children')
    .select('id, first_name, class_name')
    .eq('tenant_id', context.tenantId);

  if (!children || children.length === 0) {
    return NextResponse.json({ error: 'No children found.' }, { status: 404 });
  }

  let storiesQuery = supabase
    .from('stories')
    .select('id, child_id, theme_key')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED');
  if (requestedIds) storiesQuery = storiesQuery.in('id', requestedIds);
  const { data: stories } = await storiesQuery;

  if (!stories || stories.length === 0) {
    return NextResponse.json({ error: 'No approved stories found yet.' }, { status: 404 });
  }

  const plan = buildExportPlan(children, stories);
  const serviceClient = createSupabaseServiceRoleClient();
  const entries: { fileName: string; pdfBytes: Uint8Array }[] = [];
  const failures: { storyId: string; error: string }[] = [];

  for (const { storyId, fileName } of plan) {
    try {
      const rendered = await renderApprovedStoryPdf(supabase, serviceClient, storyId, context);
      entries.push({ fileName, pdfBytes: rendered.pdfBytes });
    } catch (error) {
      failures.push({ storyId, error: errorMessage(error) });
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
      'Content-Disposition': contentDispositionHeader(`${context.tenantName}-stories.zip`),
      'Cache-Control': 'private, no-store',
    },
  });
}
