import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PDFDocument, PDFFont } from 'pdf-lib';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

export interface EmbeddedFonts {
  latinRegular: PDFFont;
  latinDisplay: PDFFont;
  arabicRegular: PDFFont;
}

/**
 * Embeds the three open-licensed (OFL) variable fonts vendored in
 * assets/fonts (see docs/LICENSES.md) into the given PDF document.
 * pdf-lib/fontkit embeds a variable font at its default named instance —
 * true static Bold weights are a follow-up (see docs/DECISIONS.md
 * "PDF font weights").
 */
export async function embedFonts(pdfDoc: PDFDocument): Promise<EmbeddedFonts> {
  const [latinBytes, displayBytes, arabicBytes] = await Promise.all([
    readFile(join(FONTS_DIR, 'Inter-Variable.ttf')),
    readFile(join(FONTS_DIR, 'Fraunces-Variable.ttf')),
    readFile(join(FONTS_DIR, 'NotoNaskhArabic-Variable.ttf')),
  ]);

  const [latinRegular, latinDisplay, arabicRegular] = await Promise.all([
    pdfDoc.embedFont(latinBytes, { subset: true }),
    pdfDoc.embedFont(displayBytes, { subset: true }),
    pdfDoc.embedFont(arabicBytes, { subset: true }),
  ]);

  return { latinRegular, latinDisplay, arabicRegular };
}
