import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFNumber, PDFArray, rgb, LineCapStyle, type PDFPage, type PDFImage, type PDFFont } from 'pdf-lib';
import { embedFonts, type EmbeddedFonts } from './fonts';
import { drawFlatBottomBanner } from './banners';
import { drawCenteredArabicText } from './arabic-text-vector';
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
  /** Bilingual cover/back content (Phase B — see docs/DECISIONS.md "6-page
   * structure: cover + back page") — always shown in BOTH languages
   * regardless of the story's own primary `locale`, independent of
   * whichever language the interior pages were generated in. Arabic
   * child name/title fall back to the English value when the child has
   * no `arabic_first_name` on file or the template has no Arabic row. */
  titleEn: string;
  titleAr: string;
  childNameEn: string;
  childNameAr: string;
  organisationName: string;
  locale: AppLocale;
  pages: RenderPageInput[];
  /** The nursery's own logo (optional, uploaded in Settings) — drawn as a
   * small badge in the opposite top corner from the Ownly watermark. Never
   * SVG: only jpeg/png/webp ever reach Storage, see sniffImageMimeType. */
  logoBytes?: Uint8Array;
  logoContentType?: string;
}

const INK_COLOR = rgb(0.141, 0.11, 0.086);
// A soft sage caption band, matching the reference sample output — see
// docs/DECISIONS.md "PDF banner-style layout".
const CAPTION_BANNER_COLOR = rgb(0.855, 0.914, 0.851);

// The same nested-rings mark as src/components/brand/Logo.tsx and
// public/icons/icon.svg, drawn here in pdf-lib's vector path drawing
// instead of embedding a raster PNG, so it stays crisp at print
// resolution. Kept as literal paths (not a shared constant) since this
// file can't import a .tsx component — see docs/DECISIONS.md
// "Copyright watermark on every generated PDF page". Coordinates are
// relative to each ring's own centre (0,0), like the old sparkle
// mark's path — `drawSvgPath`'s `x`/`y` places that local origin on
// the page, so an off-centre path (the Logo.tsx version, absolute
// 0-100 viewBox coordinates) renders offset from where you'd expect;
// confirmed by rendering a test PDF, not assumed. Unlike the sparkle
// mark, no y-flip was needed here to match the on-screen orientation —
// also confirmed by rendering, not assumed from the sparkle's result.
const RING_SVG_PATHS = [
  'M15.21,32.63 A36,36 0 1 1 34.77,-9.32',
  'M14.34,20.48 A25,25 0 1 1 22.66,-10.57',
  'M9.90,9.90 A14,14 0 1 1 11.47,-8.03',
];
const WATERMARK_TEAL = rgb(0.184, 0.749, 0.651); // #2FBFA6
const WATERMARK_CORAL = rgb(0.886, 0.439, 0.541); // #E2708A
const WATERMARK_GOLD = rgb(0.89, 0.675, 0.239); // #E3AC3D
const WATERMARK_RING_COLORS = [WATERMARK_TEAL, WATERMARK_CORAL, WATERMARK_GOLD];
const WATERMARK_TEXT_COLOR = rgb(0.996, 0.996, 0.996);

/**
 * Renders a full print-ready PDF: a cover page, one page per story page
 * (illustration full-bleed), and a back page — 6 pages total for the
 * current 4-interior-page template length. A bare interior-pages-only
 * PDF (no cover/back) was the deliberate design for a long time — see
 * docs/DECISIONS.md "PDF cover/dedication page removed" for why, and
 * "6-page structure: cover + back page" for why that was revisited: a
 * physical printed book needs a front/back the way an in-app read-through
 * doesn't, and this reintroduction is templated (reuses the first
 * interior illustration + existing data), not a return to the earlier,
 * removed AI-generated dedication page. Sets MediaBox to the
 * bleed-inclusive page size and TrimBox/BleedBox explicitly on every
 * page (required by print vendors), per the A5 / 300 DPI / 3mm bleed
 * spec in the product brief.
 *
 * English pages get a caption band drawn here, in our own Latin font —
 * that path was never broken. Arabic pages do NOT: the caption is
 * already baked into the illustration itself by Gemini (see
 * src/lib/providers/image/prompts.ts and docs/DECISIONS.md "Arabic
 * captions baked into the illustration") — no PDF text-drawing approach
 * this project tried ever correctly shaped Arabic script from the
 * embedded font, confirmed repeatedly by rendering to an actual PDF and
 * comparing pixel-for-pixel against real shaping engines. The cover/back
 * pages' Arabic text uses a different, since-verified approach instead
 * — see arabic-text-image.ts.
 */
export async function renderStoryPdf(input: RenderStoryPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(input.title);
  pdfDoc.setSubject(`A personalised story for ${input.childName}`);
  pdfDoc.setProducer('Ownly Story Platform');

  const fonts = await embedFonts(pdfDoc);
  const isRtl = input.locale === 'ar';

  const addPage = () => {
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    setPrintBoxes(page);
    return page;
  };

  // Fraunces (the warm serif already embedded for a display role that
  // otherwise went unused — no cover/title page draws it any more, see
  // the docstring above) reads as a real storybook typeface, unlike
  // Inter's plain UI-sans look — see docs/DECISIONS.md "English caption
  // font upgraded to Fraunces". Sized and spaced against actual
  // renders (scripts/gen a sample PDF and inspect at print resolution)
  // rather than guessed.
  const captionSize = 16;
  const captionLineHeight = 23;
  const captionMaxWidth = TRIM_WIDTH_PT - 70;
  const captionBumpRadius = 15;

  // Embedded once and reused across every page's drawImage call -- embedding
  // inside the loop would duplicate the image data once per page in the
  // saved PDF.
  const nurseryLogo = input.logoBytes
    ? await embedImage(pdfDoc, input.logoBytes, input.logoContentType ?? 'image/png')
    : null;

  // The cover reuses page 1's own illustration as its background (no new
  // AI generation — see the docstring above) — embedded once here and
  // reused for the interior page 1 draw below, rather than embedding the
  // same image bytes twice in the saved PDF.
  const firstStoryPage = input.pages[0];
  const firstPageImage = firstStoryPage
    ? await embedImage(pdfDoc, firstStoryPage.imageBytes, firstStoryPage.imageContentType)
    : null;

  if (firstPageImage) {
    await renderCoverPage(addPage, fonts, firstPageImage, nurseryLogo, input);
  }

  for (const [pageIndex, storyPage] of input.pages.entries()) {
    const page = addPage();
    const image =
      pageIndex === 0 && firstPageImage
        ? firstPageImage
        : await embedImage(pdfDoc, storyPage.imageBytes, storyPage.imageContentType);

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

    drawCopyrightWatermark(page, fonts.latinRegular);
    if (nurseryLogo) drawNurseryLogoBadge(page, nurseryLogo);

    const pageNumberY = BLEED_PT + 10;

    if (!isRtl) {
      // Caption band (bottom, flush to the page edge): height grows with
      // wrapped line count so the text never collides with the page number.
      const captionLines = wrapText(storyPage.text, fonts.latinDisplay, captionSize, captionMaxWidth);
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
        const width = fonts.latinDisplay.widthOfTextAtSize(line, captionSize);
        page.drawText(line, {
          x: PAGE_WIDTH_PT / 2 - width / 2,
          y,
          size: captionSize,
          font: fonts.latinDisplay,
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

  await renderBackPage(addPage, fonts, nurseryLogo, input);

  return pdfDoc.save();
}

/**
 * Cover page: the first interior illustration, full-bleed, with a bottom
 * banner (same scalloped treatment as the interior caption band) carrying
 * the story title and the child's name in both English (real PDF text,
 * the proven path) and Arabic (real vector glyph outlines shaped by
 * HarfBuzz, see arabic-text-vector.ts — interior pages' "bake it into
 * the image" approach isn't used here: there's no per-cover AI call to
 * bake it into).
 */
async function renderCoverPage(
  addPage: () => PDFPage,
  fonts: EmbeddedFonts,
  coverImage: PDFImage,
  nurseryLogo: PDFImage | null,
  input: RenderStoryPdfInput,
): Promise<void> {
  const page = addPage();

  const coverScale = Math.max(PAGE_WIDTH_PT / coverImage.width, PAGE_HEIGHT_PT / coverImage.height);
  const drawWidth = coverImage.width * coverScale;
  const drawHeight = coverImage.height * coverScale;
  page.drawImage(coverImage, {
    x: PAGE_WIDTH_PT / 2 - drawWidth / 2,
    y: PAGE_HEIGHT_PT / 2 - drawHeight / 2,
    width: drawWidth,
    height: drawHeight,
  });

  drawCopyrightWatermark(page, fonts.latinRegular);
  if (nurseryLogo) drawNurseryLogoBadge(page, nurseryLogo);

  const bannerHeight = 200;
  drawFlatBottomBanner(page, {
    x: 0,
    width: PAGE_WIDTH_PT,
    topY: bannerHeight,
    bumpRadius: 15,
    color: CAPTION_BANNER_COLOR,
    opacity: 0.94,
  });

  const centerX = PAGE_WIDTH_PT / 2;
  const maxTextWidth = TRIM_WIDTH_PT - 60;
  let y = bannerHeight - 36;

  const titleSize = 19;
  drawCenteredLatinText(page, input.titleEn, { x: centerX, y, size: titleSize, font: fonts.latinDisplay, color: INK_COLOR });
  y -= 28;

  if (input.titleAr) {
    y = await drawCenteredArabicText(page, input.titleAr, {
      centerX,
      topY: y,
      fontSizePt: 17,
      maxWidthPt: maxTextWidth,
      color: '#241c16',
      bold: true,
    });
  }

  const byline = `A personalised story for ${input.childNameEn}`;
  drawCenteredLatinText(page, byline, { x: centerX, y, size: 12.5, font: fonts.latinRegular, color: INK_COLOR });
  y -= 20;

  if (input.childNameAr) {
    await drawCenteredArabicText(page, `قصة مخصّصة لـ ${input.childNameAr}`, {
      centerX,
      topY: y,
      fontSizePt: 12,
      maxWidthPt: maxTextWidth,
      color: '#241c16',
    });
  }
}

/**
 * Back page: solid brand background, the Ownly mark, the nursery's own
 * logo if present, and a bilingual closing line — no illustration, per
 * the product decision that cover/back stay templated rather than
 * consuming a new AI generation (see docs/DECISIONS.md "6-page
 * structure").
 */
async function renderBackPage(
  addPage: () => PDFPage,
  fonts: EmbeddedFonts,
  nurseryLogo: PDFImage | null,
  input: RenderStoryPdfInput,
): Promise<void> {
  const page = addPage();
  const backgroundColor = rgb(0.078, 0.082, 0.169); // #14152B -- same navy as the watermark badge
  const onDark = rgb(0.996, 0.996, 0.996);
  const onDarkMuted = rgb(0.788, 0.804, 0.851);

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT, color: backgroundColor });

  const centerX = PAGE_WIDTH_PT / 2;
  const maxTextWidth = TRIM_WIDTH_PT - 70;
  const ringCenterY = PAGE_HEIGHT_PT / 2 + 110;
  const ringScale = 48 / 36; // RING_SVG_PATHS' own paths reach radius 36 from their local centre

  RING_SVG_PATHS.forEach((path, index) => {
    page.drawSvgPath(path, {
      x: centerX,
      y: ringCenterY,
      scale: ringScale,
      borderColor: WATERMARK_RING_COLORS[index],
      borderWidth: 3 * ringScale,
      borderLineCap: LineCapStyle.Round,
    });
  });

  let y = ringCenterY - 70;
  drawCenteredLatinText(page, 'Ownly', { x: centerX, y, size: 22, font: fonts.latinDisplay, color: onDark });
  y -= 46;

  drawCenteredLatinText(page, 'The End', { x: centerX, y, size: 15, font: fonts.latinDisplay, color: onDark });
  y -= 24;

  y = await drawCenteredArabicText(page, 'النهاية', {
    centerX,
    topY: y,
    fontSizePt: 14,
    maxWidthPt: maxTextWidth,
    color: '#ffffff',
    bold: true,
  });
  y -= 6;

  const tagEn = `Made with love, just for ${input.childNameEn}.`;
  drawCenteredLatinText(page, tagEn, { x: centerX, y, size: 10.5, font: fonts.latinRegular, color: onDarkMuted });
  y -= 18;

  if (input.childNameAr) {
    await drawCenteredArabicText(page, `صُنعت بكل حب، خصيصًا لـ ${input.childNameAr}.`, {
      centerX,
      topY: y,
      fontSizePt: 10.5,
      maxWidthPt: maxTextWidth,
      color: '#c9cdd6',
    });
  }

  if (nurseryLogo) {
    const badgeHeight = 40;
    const badgeMaxWidth = 120;
    const padding = 6;
    const innerHeight = badgeHeight - padding * 2;
    const innerMaxWidth = badgeMaxWidth - padding * 2;
    const fitScale = Math.min(innerMaxWidth / nurseryLogo.width, innerHeight / nurseryLogo.height);
    const drawWidth = nurseryLogo.width * fitScale;
    const drawHeight = nurseryLogo.height * fitScale;
    const badgeWidth = drawWidth + padding * 2;
    const badgeBottom = BLEED_PT + 46;

    page.drawRectangle({
      x: centerX - badgeWidth / 2,
      y: badgeBottom,
      width: badgeWidth,
      height: badgeHeight,
      color: rgb(1, 1, 1),
      opacity: 0.92,
    });
    page.drawImage(nurseryLogo, {
      x: centerX - drawWidth / 2,
      y: badgeBottom + (badgeHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }
}

/** Draws one line of Latin text centered on `x` at `y`, baseline up. */
function drawCenteredLatinText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> },
): void {
  const { x, y, size, font, color } = opts;
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - width / 2, y, size, font, color });
}

/**
 * A small "Ownly" corner tag drawn on every generated page, over the
 * illustration itself (not just the surrounding chrome) — every image a
 * family or nursery might screenshot, print, or forward carries the
 * mark. Kept inside the TrimBox with a safety margin so a print vendor
 * trimming to TrimBox never cuts it off (see docs/DECISIONS.md
 * "Copyright watermark on every generated PDF page").
 */
function drawCopyrightWatermark(page: import('pdf-lib').PDFPage, textFont: import('pdf-lib').PDFFont): void {
  const margin = 10;
  const badgeWidth = 56;
  const badgeHeight = 20;
  const badgeRight = PAGE_WIDTH_PT - BLEED_PT - margin;
  const badgeTop = PAGE_HEIGHT_PT - BLEED_PT - margin;
  const badgeLeft = badgeRight - badgeWidth;
  const badgeBottom = badgeTop - badgeHeight;

  page.drawRectangle({
    x: badgeLeft,
    y: badgeBottom,
    width: badgeWidth,
    height: badgeHeight,
    color: rgb(0.078, 0.082, 0.169), // #14152B
    opacity: 0.82,
  });

  const iconSize = 14;
  const iconCenterX = badgeLeft + 3 + iconSize / 2;
  const iconCenterY = badgeBottom + badgeHeight / 2;
  // Rings' own coordinates reach out to radius 36 from their local
  // centre, so scale against that (not iconSize) to land at the
  // intended on-page size.
  const F = iconSize / 2 / 36;

  RING_SVG_PATHS.forEach((path, index) => {
    page.drawSvgPath(path, {
      x: iconCenterX,
      y: iconCenterY,
      scale: F,
      borderColor: WATERMARK_RING_COLORS[index],
      borderWidth: 8 * F,
      borderLineCap: LineCapStyle.Round,
    });
  });

  page.drawText('Ownly', {
    x: iconCenterX + iconSize / 2 + 3,
    y: badgeBottom + (badgeHeight - 7) / 2 + 1,
    size: 7,
    font: textFont,
    color: WATERMARK_TEXT_COLOR,
  });
}

/**
 * The nursery's own logo (optional, uploaded in Settings), drawn in the
 * top-LEFT corner so it never collides with the Ownly mark's top-right
 * badge — top corners are free on every page regardless of locale, since
 * the caption band (English only) sits flush to the bottom. On a white
 * backing plate so an arbitrary logo (any aspect ratio, any background)
 * stays legible over a busy illustration, letterboxed to fit rather than
 * stretched.
 */
function drawNurseryLogoBadge(page: import('pdf-lib').PDFPage, logo: import('pdf-lib').PDFImage): void {
  const margin = 10;
  const badgeHeight = 28;
  const badgeMaxWidth = 90;
  const padding = 4;

  const innerHeight = badgeHeight - padding * 2;
  const innerMaxWidth = badgeMaxWidth - padding * 2;
  const fitScale = Math.min(innerMaxWidth / logo.width, innerHeight / logo.height);
  const drawWidth = logo.width * fitScale;
  const drawHeight = logo.height * fitScale;
  const badgeWidth = drawWidth + padding * 2;

  const badgeLeft = BLEED_PT + margin;
  const badgeTop = PAGE_HEIGHT_PT - BLEED_PT - margin;
  const badgeBottom = badgeTop - badgeHeight;

  page.drawRectangle({
    x: badgeLeft,
    y: badgeBottom,
    width: badgeWidth,
    height: badgeHeight,
    color: rgb(1, 1, 1),
    opacity: 0.88,
  });

  page.drawImage(logo, {
    x: badgeLeft + (badgeWidth - drawWidth) / 2,
    y: badgeBottom + (badgeHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
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
