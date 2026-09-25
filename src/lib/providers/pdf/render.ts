import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFNumber, PDFArray, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { embedFonts } from './fonts';
import { shapeArabicForPdf, containsArabic, splitIntoDirectionRuns } from './arabic-shaping';
import { drawFlatBottomBanner } from './banners';
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
  locale: AppLocale;
  pages: RenderPageInput[];
}

const INK_COLOR = rgb(0.141, 0.11, 0.086);
// A soft sage caption band, matching the reference sample output — see
// docs/DECISIONS.md "PDF banner-style layout".
const CAPTION_BANNER_COLOR = rgb(0.855, 0.914, 0.851);

/**
 * Renders a full print-ready PDF: one page per story page, illustration
 * full-bleed with its caption in a band at the bottom — no cover,
 * dedication, or repeating title banner (removed per pilot feedback: they
 * read as filler, and repeating the English theme title on every single
 * page added nothing). Sets MediaBox to the bleed-inclusive page size and
 * TrimBox/BleedBox explicitly (required by print vendors), per the A5 /
 * 300 DPI / 3mm bleed spec in the product brief.
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

  // Full-bleed illustration with a scalloped pastel caption band at the
  // bottom carrying each page's story text — see docs/DECISIONS.md "PDF
  // banner-style layout".
  const captionFont = isRtl ? fonts.arabicRegular : fonts.latinRegular;
  const captionSize = 14;
  const captionLineHeight = 20;
  const captionMaxWidth = TRIM_WIDTH_PT - 70;
  const captionBumpRadius = 15;

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

    // Caption band (bottom, flush to the page edge): height grows with
    // wrapped line count so the text never collides with the page number.
    const captionIsArabic = containsArabic(storyPage.text);
    const captionLines = captionIsArabic
      ? wrapArabicParagraph(storyPage.text, captionFont, captionSize, captionMaxWidth)
      : wrapText(storyPage.text, captionFont, captionSize, captionMaxWidth);
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

    captionLines.forEach((line, index) => {
      const y = captionFirstLineY - index * captionLineHeight;
      if (captionIsArabic) {
        // `line` here is already shaped + reordered — draw it as its own
        // direction-homogeneous runs, never as one drawText call over the
        // whole (mixed-direction) line. See splitIntoDirectionRuns's
        // comment for why.
        drawShapedLine(page, line, {
          font: captionFont,
          size: captionSize,
          centerX: PAGE_WIDTH_PT / 2,
          y,
          color: INK_COLOR,
        });
      } else {
        const width = captionFont.widthOfTextAtSize(line, captionSize);
        page.drawText(line, {
          x: PAGE_WIDTH_PT / 2 - width / 2,
          y,
          size: captionSize,
          font: captionFont,
          color: INK_COLOR,
        });
      }
    });

    const pageNumberText = String(storyPage.pageNumber);
    const pageNumberWidth = fonts.latinRegular.widthOfTextAtSize(pageNumberText, 9);
    page.drawText(pageNumberText, {
      x: PAGE_WIDTH_PT / 2 - pageNumberWidth / 2,
      y: pageNumberY,
      size: 9,
      font: fonts.latinRegular,
      color: INK_COLOR,
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

/**
 * `PDFFont.widthOfTextAtSize` under-reports Arabic presentation-form
 * text's real rendered width — re-measured directly by rendering runs
 * to an actual PDF, rasterising with pdftoppm, and pixel-measuring the
 * real ink extent against pdf-lib's reported width: two sample runs
 * came out at 1.42x and 1.39x, not the ~1.15x an earlier (apparently
 * looser) measurement had found. 1.2x was too small once runs are
 * drawn as separate drawText calls and positioned relative to each
 * other (drawShapedLine) — every run's under-measurement now
 * compounds into the next run's start position instead of being
 * absorbed by one drawText call laying out a whole line itself, so an
 * Arabic run immediately before a Latin run (a child's or
 * organisation's name) visibly overlapped it. Root cause of the gap
 * itself still not pinned down (most likely how pdf-lib derives
 * per-glyph advance widths for combining-mark codepoints vs. what it
 * writes into the PDF's own CID width array); this factor is a
 * deliberate safety margin — with a little headroom above the ~1.4x
 * measured — so runs never overlap without depending on that root
 * cause being fixed. See docs/DECISIONS.md "Arabic PDF text shaping".
 */
const ARABIC_ADVANCE_WIDTH_FUDGE = 1.45;

/**
 * Wraps an Arabic paragraph into lines, each ALREADY shaped + bidi-
 * reordered and ready to hand to drawShapedLine. Deliberately wraps on
 * the LOGICAL-order words first and only shapes/reorders each finished
 * line — shaping the whole paragraph once and then splitting it into
 * lines by whitespace (the previous approach) reorders the paragraph as
 * a single visual unit, which is wrong the moment it needs more than one
 * line: reordering must happen per rendered line, not once for the
 * whole paragraph. See docs/DECISIONS.md "Arabic PDF text shaping".
 */
function wrapArabicParagraph(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const shapedWidth = (logical: string) => measureShapedLineWidth(font, size, shapeArabicForPdf(logical));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (shapedWidth(word) > maxWidth) {
      if (current) {
        lines.push(shapeArabicForPdf(current));
        current = '';
      }
      let chunk = '';
      for (const char of word) {
        const candidate = chunk + char;
        if (shapedWidth(candidate) > maxWidth && chunk) {
          lines.push(shapeArabicForPdf(chunk));
          chunk = char;
        } else {
          chunk = candidate;
        }
      }
      current = chunk;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (shapedWidth(candidate) > maxWidth && current) {
      lines.push(shapeArabicForPdf(current));
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(shapeArabicForPdf(current));
  return lines;
}

function runWidth(font: PDFFont, size: number, run: { text: string; isArabic: boolean }): number {
  return font.widthOfTextAtSize(run.text, size) * (run.isArabic ? ARABIC_ADVANCE_WIDTH_FUDGE : 1);
}

function measureShapedLineWidth(font: PDFFont, size: number, shapedLine: string): number {
  return splitIntoDirectionRuns(shapedLine).reduce((sum, run) => sum + runWidth(font, size, run), 0);
}

/**
 * Draws one already-shaped/reordered Arabic line, centered on centerX.
 * Splits it into same-script runs and draws each as its OWN `drawText`
 * call — never the whole (mixed-direction) line in one call — because
 * pdf-lib's CustomFontEmbedder routes text through fontkit's `layout()`,
 * which performs its own bidi pass and reverses embedded Latin runs
 * (a child's name, an organisation name) that shapeArabicForPdf already
 * placed correctly. A call containing only one script gives fontkit
 * nothing to "fix". See splitIntoDirectionRuns's comment for how this
 * was diagnosed.
 */
function drawShapedLine(
  page: PDFPage,
  shapedLine: string,
  options: { font: PDFFont; size: number; centerX: number; y: number; color: ReturnType<typeof rgb> },
): void {
  const runs = splitIntoDirectionRuns(shapedLine);
  const totalWidth = runs.reduce((sum, run) => sum + runWidth(options.font, options.size, run), 0);
  let x = options.centerX - totalWidth / 2;
  for (const run of runs) {
    page.drawText(run.text, { x, y: options.y, size: options.size, font: options.font, color: options.color });
    x += runWidth(options.font, options.size, run);
  }
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
