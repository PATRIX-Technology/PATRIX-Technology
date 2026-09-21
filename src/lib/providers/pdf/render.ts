import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFNumber, PDFArray, rgb } from 'pdf-lib';
import { embedFonts } from './fonts';
import { shapeArabicForPdf, containsArabic } from './arabic-shaping';
import { BLEED_PT, PAGE_HEIGHT_PT, PAGE_WIDTH_PT, TRIM_HEIGHT_PT, TRIM_WIDTH_PT } from './geometry';
import type { AppLocale } from '@/types/database';

export interface RenderPageInput {
  pageNumber: number;
  text: string;
  imageBytes: Uint8Array;
  imageContentType: string;
}

export interface RenderStoryPdfInput {
  title: string;
  childName: string;
  organisationName: string;
  organisationLogoBytes?: Uint8Array;
  locale: AppLocale;
  pages: RenderPageInput[];
  dedication?: string;
}

const BRAND_COLOR = rgb(0.125, 0.58, 0.612); // lagoon-600
const INK_COLOR = rgb(0.141, 0.11, 0.086);

/**
 * Renders a full print-ready PDF: cover, dedication, one page per story
 * page, and a closing brand page. Sets MediaBox to the bleed-inclusive
 * page size and TrimBox/BleedBox explicitly (required by print vendors),
 * per the A5 / 300 DPI / 3mm bleed spec in the product brief.
 */
export async function renderStoryPdf(input: RenderStoryPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(input.title);
  pdfDoc.setSubject(`A personalised story for ${input.childName}`);
  pdfDoc.setProducer('Hikayti Story Platform');

  const fonts = await embedFonts(pdfDoc);
  const isRtl = input.locale === 'ar';

  const addPage = () => {
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    setPrintBoxes(page);
    return page;
  };

  // --- Cover page --------------------------------------------------------
  const cover = addPage();
  drawCenteredText(cover, input.title, {
    font: isRtl ? fonts.arabicRegular : fonts.latinDisplay,
    size: 30,
    y: PAGE_HEIGHT_PT / 2 + 40,
    color: BRAND_COLOR,
    rtl: isRtl,
  });
  drawCenteredText(cover, input.childName, {
    font: isRtl ? fonts.arabicRegular : fonts.latinDisplay,
    size: 22,
    y: PAGE_HEIGHT_PT / 2 - 10,
    color: INK_COLOR,
    rtl: isRtl,
  });
  if (input.organisationLogoBytes) {
    const logo = await embedRasterImage(pdfDoc, input.organisationLogoBytes);
    const logoWidth = 90;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    cover.drawImage(logo, {
      x: PAGE_WIDTH_PT / 2 - logoWidth / 2,
      y: BLEED_PT + 30,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // --- Dedication page -----------------------------------------------------
  const dedication = addPage();
  const dedicationText =
    input.dedication ??
    (isRtl
      ? `صُممت هذه القصة خصيصًا لـ${input.childName} من ${input.organisationName}.`
      : `This story was created especially for ${input.childName} by ${input.organisationName}.`);
  drawCenteredText(dedication, dedicationText, {
    font: isRtl ? fonts.arabicRegular : fonts.latinRegular,
    size: 16,
    y: PAGE_HEIGHT_PT / 2,
    color: INK_COLOR,
    rtl: isRtl,
    maxWidth: TRIM_WIDTH_PT - 60,
  });

  // --- Story pages -----------------------------------------------------
  for (const storyPage of input.pages) {
    const page = addPage();
    const image = await embedImage(pdfDoc, storyPage.imageBytes, storyPage.imageContentType);
    const imageAreaHeight = TRIM_HEIGHT_PT * 0.62;
    const imageAreaWidth = TRIM_WIDTH_PT;
    const scale = Math.min(imageAreaWidth / image.width, imageAreaHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    page.drawImage(image, {
      x: PAGE_WIDTH_PT / 2 - drawWidth / 2,
      y: PAGE_HEIGHT_PT - BLEED_PT - drawHeight - 20,
      width: drawWidth,
      height: drawHeight,
    });

    drawCenteredText(page, storyPage.text, {
      font: isRtl ? fonts.arabicRegular : fonts.latinRegular,
      size: 14,
      y: PAGE_HEIGHT_PT - BLEED_PT - drawHeight - 60,
      color: INK_COLOR,
      rtl: isRtl,
      maxWidth: TRIM_WIDTH_PT - 50,
      lineHeight: 20,
    });

    drawCenteredText(page, String(storyPage.pageNumber), {
      font: fonts.latinRegular,
      size: 10,
      y: BLEED_PT + 16,
      color: INK_COLOR,
      rtl: false,
    });
  }

  return pdfDoc.save();
}

function setPrintBoxes(page: import('pdf-lib').PDFPage): void {
  const trimBox = PDFArray.withContext(page.doc.context);
  [BLEED_PT, BLEED_PT, PAGE_WIDTH_PT - BLEED_PT, PAGE_HEIGHT_PT - BLEED_PT].forEach((n) =>
    trimBox.push(PDFNumber.of(n)),
  );
  const bleedBox = PDFArray.withContext(page.doc.context);
  [0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT].forEach((n) => bleedBox.push(PDFNumber.of(n)));

  page.node.set(PDFName.of('TrimBox'), trimBox);
  page.node.set(PDFName.of('BleedBox'), bleedBox);
}

async function embedImage(pdfDoc: PDFDocument, bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/png') return pdfDoc.embedPng(bytes);
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return pdfDoc.embedJpg(bytes);
  // SVG (mock provider output) has no native pdf-lib embedder; rasterise
  // is out of scope for the mock path, so we draw a simple fallback PNG
  // placeholder instead. Real illustrations are always PNG/JPG.
  return embedFallbackPng(pdfDoc);
}

async function embedRasterImage(pdfDoc: PDFDocument, bytes: Uint8Array) {
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    return pdfDoc.embedJpg(bytes);
  }
}

let fallbackPngCache: Uint8Array | null = null;
async function embedFallbackPng(pdfDoc: PDFDocument) {
  if (!fallbackPngCache) {
    // 1x1 transparent PNG, base64-decoded, used only when a mock SVG asset
    // is encountered (SVG cannot be embedded directly by pdf-lib).
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAAl21bKAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    fallbackPngCache = Buffer.from(base64, 'base64');
  }
  return pdfDoc.embedPng(fallbackPngCache);
}

interface DrawTextOptions {
  font: import('pdf-lib').PDFFont;
  size: number;
  y: number;
  color: ReturnType<typeof rgb>;
  rtl: boolean;
  maxWidth?: number;
  lineHeight?: number;
}

function drawCenteredText(page: import('pdf-lib').PDFPage, text: string, options: DrawTextOptions): void {
  // NOTE: shaping+reordering runs once on the full paragraph, then lines
  // are split by naive whitespace wrapping. For short story captions (1-3
  // sentences) this reads correctly, but a fully correct implementation
  // would re-run bidi reordering per wrapped line. Flagged for native
  // review + a physical print proof before any real print run — see
  // docs/DECISIONS.md "Arabic PDF text shaping".
  const displayText = options.rtl || containsArabic(text) ? shapeArabicForPdf(text) : text;
  const maxWidth = options.maxWidth ?? TRIM_WIDTH_PT - 60;
  const lines = wrapText(displayText, options.font, options.size, maxWidth);
  const lineHeight = options.lineHeight ?? options.size * 1.4;

  lines.forEach((line, index) => {
    const width = options.font.widthOfTextAtSize(line, options.size);
    page.drawText(line, {
      x: PAGE_WIDTH_PT / 2 - width / 2,
      y: options.y - index * lineHeight,
      size: options.size,
      font: options.font,
      color: options.color,
    });
  });
}

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
