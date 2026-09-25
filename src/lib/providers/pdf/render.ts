import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFNumber, PDFArray, rgb } from 'pdf-lib';
import { embedFonts } from './fonts';
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
 * full-bleed — no cover, dedication, or repeating title banner (removed
 * per pilot feedback: they read as filler, and repeating the English
 * theme title on every single page added nothing). Sets MediaBox to the
 * bleed-inclusive page size and TrimBox/BleedBox explicitly (required by
 * print vendors), per the A5 / 300 DPI / 3mm bleed spec in the product
 * brief.
 *
 * English pages get a caption band drawn here, in our own Latin font —
 * that path was never broken. Arabic pages do NOT: the caption is
 * already baked into the illustration itself by Gemini (see
 * src/lib/providers/image/prompts.ts and docs/DECISIONS.md "Arabic
 * captions baked into the illustration") — no PDF text-drawing approach
 * this project tried ever correctly shaped Arabic script from the
 * embedded font, confirmed repeatedly by rendering to an actual PDF and
 * comparing pixel-for-pixel against real shaping engines.
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

    const pageNumberY = BLEED_PT + 10;

    if (!isRtl) {
      // Caption band (bottom, flush to the page edge): height grows with
      // wrapped line count so the text never collides with the page number.
      const captionLines = wrapText(storyPage.text, fonts.latinRegular, captionSize, captionMaxWidth);
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
        const width = fonts.latinRegular.widthOfTextAtSize(line, captionSize);
        page.drawText(line, {
          x: PAGE_WIDTH_PT / 2 - width / 2,
          y,
          size: captionSize,
          font: fonts.latinRegular,
          color: INK_COLOR,
        });
      });
    }

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
