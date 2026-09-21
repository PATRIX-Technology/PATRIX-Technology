import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFNumber, PDFArray, rgb } from 'pdf-lib';
import { embedFonts } from './fonts';
import { shapeArabicForPdf, containsArabic } from './arabic-shaping';
import { drawFreeFloatingBanner, drawFlatBottomBanner } from './banners';
import { BLEED_PT, PAGE_HEIGHT_PT, PAGE_WIDTH_PT, TRIM_WIDTH_PT } from './geometry';
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
// Scalloped-banner palette, tuned to match the reference sample output: a
// warm cream "sticker" for the repeating title banner and a soft sage band
// for each page's caption — see docs/DECISIONS.md "PDF banner-style layout".
const TITLE_BANNER_COLOR = rgb(0.988, 0.965, 0.914);
const CAPTION_BANNER_COLOR = rgb(0.855, 0.914, 0.851);

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
  // Full-bleed illustration with a repeating "sticker" title banner top
  // and a scalloped pastel caption band bottom, matching the reference
  // sample output the nursery/parent-facing PDF is designed to resemble —
  // see docs/DECISIONS.md "PDF banner-style layout".
  const captionFont = isRtl ? fonts.arabicRegular : fonts.latinRegular;
  const captionSize = 14;
  const captionLineHeight = 20;
  const captionMaxWidth = TRIM_WIDTH_PT - 70;
  const captionBumpRadius = 15;

  const titleFont = isRtl ? fonts.arabicRegular : fonts.latinDisplay;
  const titleSize = isRtl ? 19 : 17;
  const titleLineHeight = titleSize * 1.35;
  const titleBannerWidth = TRIM_WIDTH_PT - 20;
  const titleMaxWidth = titleBannerWidth - 56;
  const titleBumpRadius = 13;

  for (const storyPage of input.pages) {
    const page = addPage();
    const image = await embedImage(pdfDoc, storyPage.imageBytes, storyPage.imageContentType);

    // Cover-fit: scale so the image fully covers the bleed-inclusive page,
    // cropping the overflow (a conforming reader clips content to the
    // MediaBox, so no explicit clip path is needed here).
    const coverScale = Math.max(PAGE_WIDTH_PT / image.width, PAGE_HEIGHT_PT / image.height);
    const drawWidth = image.width * coverScale;
    const drawHeight = image.height * coverScale;
    page.drawImage(image, {
      x: PAGE_WIDTH_PT / 2 - drawWidth / 2,
      y: PAGE_HEIGHT_PT / 2 - drawHeight / 2,
      width: drawWidth,
      height: drawHeight,
    });

    // Title banner (repeats every page): height grows with wrapped line
    // count so a long title + child name never overflows the sticker.
    // Divides by ARABIC_ADVANCE_WIDTH_FUDGE to match drawCenteredText's own
    // wrap width exactly, so the pre-measured line count used to size the
    // banner never drifts from what actually gets drawn inside it.
    const titleIsArabic = containsArabic(input.title);
    const titleLines = wrapText(
      titleIsArabic ? shapeArabicForPdf(input.title) : input.title,
      titleFont,
      titleSize,
      titleIsArabic ? titleMaxWidth / ARABIC_ADVANCE_WIDTH_FUDGE : titleMaxWidth,
    );
    const titleBannerHeight = titleLines.length * titleLineHeight + 32;
    const titleBannerCenterY = PAGE_HEIGHT_PT - BLEED_PT - titleBannerHeight / 2 - 14;
    drawFreeFloatingBanner(page, {
      centerX: PAGE_WIDTH_PT / 2,
      centerY: titleBannerCenterY,
      width: titleBannerWidth,
      height: titleBannerHeight,
      bumpRadius: titleBumpRadius,
      color: TITLE_BANNER_COLOR,
      opacity: 0.96,
    });
    drawCenteredText(page, input.title, {
      font: titleFont,
      size: titleSize,
      y:
        titleBannerCenterY +
        ((titleLines.length - 1) * titleLineHeight) / 2,
      color: INK_COLOR,
      rtl: isRtl,
      maxWidth: titleMaxWidth,
      lineHeight: titleLineHeight,
    });

    // Caption band (bottom, flush to the page edge): height grows with
    // wrapped line count so the text never collides with the page number.
    const captionIsArabic = containsArabic(storyPage.text);
    const captionLines = wrapText(
      captionIsArabic ? shapeArabicForPdf(storyPage.text) : storyPage.text,
      captionFont,
      captionSize,
      captionIsArabic ? captionMaxWidth / ARABIC_ADVANCE_WIDTH_FUDGE : captionMaxWidth,
    );
    const pageNumberY = BLEED_PT + 10;
    const captionFirstLineY = pageNumberY + 24 + (captionLines.length - 1) * captionLineHeight;
    const captionTopY = captionFirstLineY + captionSize + 22;
    drawFlatBottomBanner(page, {
      x: 0,
      width: PAGE_WIDTH_PT,
      topY: captionTopY,
      bumpRadius: captionBumpRadius,
      color: CAPTION_BANNER_COLOR,
      opacity: 0.94,
    });
    drawCenteredText(page, storyPage.text, {
      font: captionFont,
      size: captionSize,
      y: captionFirstLineY,
      color: INK_COLOR,
      rtl: isRtl,
      maxWidth: captionMaxWidth,
      lineHeight: captionLineHeight,
    });

    drawCenteredText(page, String(storyPage.pageNumber), {
      font: fonts.latinRegular,
      size: 9,
      y: pageNumberY,
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

/**
 * `PDFFont.widthOfTextAtSize` measures Arabic presentation-form/combining
 * text roughly 15% narrower than these fonts actually render in real PDF
 * viewers (verified against both MuPDF and Chromium's PDFium — the same
 * string's rendered bounding box came out ~1.15x pdf-lib's reported width;
 * Latin text showed no such gap). Root cause not fully pinned down (most
 * likely how pdf-lib derives per-glyph advance widths for combining-mark
 * codepoints vs. what it writes into the PDF's own CID width array); this
 * factor is a deliberate safety margin so wrapping/centering stay correct
 * — and Arabic text never clips past the trim edge — without depending on
 * that root cause being fixed. See docs/DECISIONS.md "Arabic PDF text
 * shaping".
 */
const ARABIC_ADVANCE_WIDTH_FUDGE = 1.2;

function drawCenteredText(page: import('pdf-lib').PDFPage, text: string, options: DrawTextOptions): void {
  // NOTE: shaping+reordering runs once on the full paragraph, then lines
  // are split by naive whitespace wrapping. For short story captions (1-3
  // sentences) this reads correctly, but a fully correct implementation
  // would re-run bidi reordering per wrapped line. Flagged for native
  // review + a physical print proof before any real print run — see
  // docs/DECISIONS.md "Arabic PDF text shaping".
  const isArabic = options.rtl || containsArabic(text);
  const displayText = isArabic ? shapeArabicForPdf(text) : text;
  const widthFudge = isArabic ? ARABIC_ADVANCE_WIDTH_FUDGE : 1;
  const maxWidth = options.maxWidth ?? TRIM_WIDTH_PT - 60;
  const lines = wrapText(displayText, options.font, options.size, maxWidth / widthFudge);
  const lineHeight = options.lineHeight ?? options.size * 1.4;

  lines.forEach((line, index) => {
    const width = options.font.widthOfTextAtSize(line, options.size) * widthFudge;
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
    // A single word wider than the whole line (a long compound phrase with
    // no breakable space, which AI-generated captions can produce) would
    // otherwise overflow past the page edge — break it at the character
    // level as a last resort rather than let it visually clip.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(...splitLongWord(word, font, size, maxWidth));
      continue;
    }

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

function splitLongWord(word: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const char of word) {
    const candidate = current + char;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
