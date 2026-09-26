import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { renderApprovedStoryPdf } from '@/lib/domain/story-pdf';
import { buildBulkZip, buildExportPlan, sanitizeFileNamePart } from '@/lib/providers/pdf/bulk-zip';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
// Rendering every approved story tenant-wide sequentially can easily run
// past Vercel's 10s default — see the same reasoning on the single-story
// PDF route. 300 is the Vercel Pro ceiling; on the Hobby plan Vercel
// silently clamps this to its own 60s max, so this value is safe to ship
// now and takes effect with no further deploy the moment the project
// upgrades to Pro.
export const maxDuration = 300;

/**
 * Whole-tenant export: every APPROVED story, one ZIP, folder per class
 * (see buildExportPlan for the exact naming rules).
 */
export async function GET(): Promise<NextResponse | Response> {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: children } = await supabase
    .from('children')
    .select('id, first_name, class_name')
    .eq('tenant_id', context.tenantId);

  if (!children || children.length === 0) {
    return NextResponse.json({ error: 'No children found.' }, { status: 404 });
  }

  const { data: stories } = await supabase
    .from('stories')
    .select('id, child_id, theme_key')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'APPROVED');

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
      'Content-Disposition': `attachment; filename="${sanitizeFileNamePart(context.tenantName)}-stories.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
