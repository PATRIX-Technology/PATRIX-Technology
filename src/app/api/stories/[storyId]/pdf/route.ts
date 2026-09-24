import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { PdfPreflightFailedError, renderApprovedStoryPdf } from '@/lib/domain/story-pdf';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
// Rendering embeds every page's real image + runs preflight checks, which
// can run past Vercel's 10s default on a story with several pages —
// see the same reasoning on the child page's maxDuration.
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: { storyId: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const serviceClient = createSupabaseServiceRoleClient();
    const result = await renderApprovedStoryPdf(supabase, serviceClient, params.storyId, context);

    return new NextResponse(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // "inline" so clicking the link opens the PDF in the browser's own
        // viewer rather than forcing a download — the browser's Save
        // button still works from there when someone actually wants the
        // file.
        'Content-Disposition': `inline; filename="${result.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof PdfPreflightFailedError) {
      // Fail loudly per the product spec — never hand out a PDF that does
      // not meet the print spec, even if it "looks fine" in a preview.
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 422 });
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
