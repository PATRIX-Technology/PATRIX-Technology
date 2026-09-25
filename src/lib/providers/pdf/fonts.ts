import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PDFDocument, PDFFont } from 'pdf-lib';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

export interface EmbeddedFonts {
  latinRegular: PDFFont;
  latinDisplay: PDFFont;
}

/**
 * Embeds static, single-instance fonts pre-generated from the open-licensed
 * (OFL) variable fonts vendored in assets/fonts (see docs/LICENSES.md), via
 * `fonttools varLib.instancer` — NOT the raw variable font files.
 *
 * This was forced by a real bug, not a style preference: embedding the raw
 * variable fonts directly (pdf-lib/fontkit's "default named instance"
 * approach the codebase used originally) produced PDFs where nearly every
 * glyph failed to render — confirmed independently in both MuPDF and
 * Chromium's PDFium — while `PDFFont.widthOfTextAtSize` kept reporting
 * plausible non-zero widths, so text silently measured fine but never
 * actually drew. Pre-instantiating a single static weight/width from each
 * variable font before embedding fixed rendering in both engines. See
 * docs/DECISIONS.md "PDF font subsetting disabled" for the full writeup
 * and how to regenerate these files if the source variable fonts change.
 *
 * No Arabic font is embedded here: Arabic captions are baked into the
 * illustration by Gemini, not drawn as PDF text — see docs/DECISIONS.md
 * "Arabic captions baked into the illustration".
 */
export async function embedFonts(pdfDoc: PDFDocument): Promise<EmbeddedFonts> {
  const [latinBytes, displayBytes] = await Promise.all([
    readFile(join(FONTS_DIR, 'Inter-Regular-Static.ttf')),
    readFile(join(FONTS_DIR, 'Fraunces-Display-Static.ttf')),
  ]);

  const [latinRegular, latinDisplay] = await Promise.all([
    pdfDoc.embedFont(latinBytes, { subset: false }),
    pdfDoc.embedFont(displayBytes, { subset: false }),
  ]);

  return { latinRegular, latinDisplay };
}
