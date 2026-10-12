import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFNumber, PDFArray, rgb, LineCapStyle, type PDFPage, type PDFImage, type PDFFont } from 'pdf-lib';
import { embedFonts, type EmbeddedFonts } from './fonts';
import { drawFlatBottomBanner } from './banners';
import { drawCenteredArabicText, measureArabicTextLines } from './arabic-text-vector';
import { BLEED_PT, PAGE_HEIGHT_PT, PAGE_WIDTH_PT, TRIM_WIDTH_PT } from './geometry';
import type { AppLocale } from '@/types/database';

export interface RenderPageInput {
  pageNumber: number;
  text: string;
  /** The Arabic caption for this page, only present for a bilingual
   * story (story_pages.text_ar — see docs/DECISIONS.md "Bilingual-in-
   * one-book generation"). `text` above stays the English caption for
   * every bilingual page, regardless of the story's primary `locale`. */
  textAr?: string;
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
  /** See docs/DECISIONS.md "Bilingual-in-one-book generation". When set,
   * every interior page's caption band draws BOTH `pages[].text`
   * (English, real PDF text) and `pages[].textAr` (Arabic, HarfBuzz
   * vector glyphs) stacked together — no caption gets baked into the
   * illustration for a bilingual story, unlike a plain Arabic-locale one. */
  bilingual?: boolean;
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

/**
 * Renders a full print-ready PDF: a cover page, one page per story page
 * (illustration full-bleed), and a back page — the page count is always
 * the template's interior-page count plus 2 (8 pages for today's
 * 6-interior-page templates); this loop never hardcodes a total. A bare
 * interior-pages-only
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
  const bilingual = Boolean(input.bilingual);

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

    const pageNumberY = BLEED_PT + 10;

    if (bilingual) {
      // Both captions, stacked in one banner: English (real PDF text, same
      // font/path as the non-bilingual branch below) on top, Arabic
      // (HarfBuzz vector glyphs, same path as the cover/back pages) below
      // it, closest to the page number. measureArabicTextLines() lets the
      // Arabic block's height be known BEFORE drawing, so the banner and
      // the English block above it can be sized correctly first — see its
      // docstring in arabic-text-vector.ts for why the topY math below has
      // to mirror drawCenteredArabicText's own baseline formula exactly.
      //
      // Deliberately its own, smaller set of sizing constants, NOT the
      // single-language captionSize/captionLineHeight above — a founder-
      // reported real render at the original sizes (matching the single-
      // language ones) produced a banner tall enough to crop the page's
      // own mascot out of frame. These are tuned to cut the stacked
      // band's total height by roughly a quarter versus that first pass,
      // while staying legible at A5 print size — paired with
      // buildIllustrationPrompt's bilingual branch reserving the bottom
      // 30% of the illustration itself, so the mascot is never placed
      // where this band will sit in the first place.
      const captionAr = storyPage.textAr ?? '';
      const bilingualCaptionSize = 14;
      const bilingualCaptionLineHeight = 18;
      const arabicCaptionSize = 13;
      const arabicLineHeight = 19;
      const blockGap = 6;
      const bottomMargin = 11;
      const topPadding = 8;

      const enLines = wrapText(storyPage.text, fonts.latinDisplay, bilingualCaptionSize, captionMaxWidth);
      const arLineCount = captionAr
        ? await measureArabicTextLines(captionAr, arabicCaptionSize, captionMaxWidth)
        : 0;

      const arabicTopY = captionAr
        ? pageNumberY + bottomMargin + arabicCaptionSize * 0.92 + (arLineCount - 1) * arabicLineHeight
        : pageNumberY + bottomMargin;
      const englishBottomBaselineY = captionAr ? arabicTopY + blockGap : pageNumberY + bottomMargin;
      const englishFirstLineY = englishBottomBaselineY + (enLines.length - 1) * bilingualCaptionLineHeight;
      const captionTopY = englishFirstLineY + bilingualCaptionSize + topPadding;

      drawFlatBottomBanner(page, {
        x: 0,
        width: PAGE_WIDTH_PT,
        topY: captionTopY,
        bumpRadius: captionBumpRadius,
        color: CAPTION_BANNER_COLOR,
        opacity: 0.94,
      });

      enLines.forEach((line, index) => {
        const y = englishFirstLineY - index * bilingualCaptionLineHeight;
        const width = fonts.latinDisplay.widthOfTextAtSize(line, bilingualCaptionSize);
        page.drawText(line, {
          x: PAGE_WIDTH_PT / 2 - width / 2,
          y,
          size: bilingualCaptionSize,
          font: fonts.latinDisplay,
          color: INK_COLOR,
        });
      });

      if (captionAr) {
        await drawCenteredArabicText(page, captionAr, {
          centerX: PAGE_WIDTH_PT / 2,
          topY: arabicTopY,
          fontSizePt: arabicCaptionSize,
          maxWidthPt: captionMaxWidth,
        });
      }
    } else if (!isRtl) {
      // Caption band (bottom, flush to the page edge): height grows with
      // wrapped line count so the text never collides with the page number.
      const captionLines = wrapText(storyPage.text, fonts.latinDisplay, captionSize, captionMaxWidth);
      const captionFirstLineY = pageNumberY + 16 + (captionLines.length - 1) * captionLineHeight;
      const captionTopY = captionFirstLineY + captionSize + 14;
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

    drawBrandBadges(page, fonts.latinRegular, nurseryLogo, pageNumberY);
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

  const bannerHeight = 160;
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
  let y = bannerHeight - 32;

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

  drawBrandBadges(page, fonts.latinRegular, nurseryLogo, BLEED_PT + 10);
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
  const pairCenterY = PAGE_HEIGHT_PT / 2 + 110;

  // Ownly's own mark and the nursery's logo, drawn at the same height and
  // side by side -- per the founder's explicit request, the nursery's
  // logo is no longer a small afterthought badge near the bottom of the
  // page; it gets equal visual weight to Ownly's own mark, as a genuine
  // co-branding pairing (a thin divider line between them, no frame or
  // backing plate around either -- the nursery logo is drawn as its own
  // raw image, letterboxed to the same height, not boxed in white).
  const logoPairHeight = 56;
  const ownlyIconSize = logoPairHeight;
  const ownlyTextSize = 22;
  const ownlyIconTextGap = 10;
  const ownlyText = 'Ownly';
  const ownlyTextWidth = fonts.latinDisplay.widthOfTextAtSize(ownlyText, ownlyTextSize);
  const ownlyBlockWidth = ownlyIconSize + ownlyIconTextGap + ownlyTextWidth;

  let nurseryDrawWidth = 0;
  let nurseryDrawHeight = 0;
  if (nurseryLogo) {
    const fitScale = Math.min(160 / nurseryLogo.width, logoPairHeight / nurseryLogo.height);
    nurseryDrawWidth = nurseryLogo.width * fitScale;
    nurseryDrawHeight = nurseryLogo.height * fitScale;
  }

  const dividerGap = nurseryLogo ? 32 : 0;
  const pairTotalWidth = ownlyBlockWidth + dividerGap + nurseryDrawWidth;
  const pairLeftX = centerX - pairTotalWidth / 2;

  const ownlyIconCenterX = pairLeftX + ownlyIconSize / 2;
  const ringScale = ownlyIconSize / 2 / 36; // RING_SVG_PATHS' own paths reach radius 36 from their local centre
  RING_SVG_PATHS.forEach((path, index) => {
    page.drawSvgPath(path, {
      x: ownlyIconCenterX,
      y: pairCenterY,
      scale: ringScale,
      borderColor: WATERMARK_RING_COLORS[index],
      borderWidth: 3 * ringScale,
      borderLineCap: LineCapStyle.Round,
    });
  });
  page.drawText(ownlyText, {
    x: pairLeftX + ownlyIconSize + ownlyIconTextGap,
    y: pairCenterY - ownlyTextSize * 0.34,
    size: ownlyTextSize,
    font: fonts.latinDisplay,
    color: onDark,
  });

  if (nurseryLogo) {
    const dividerX = pairLeftX + ownlyBlockWidth + dividerGap / 2;
    page.drawLine({
      start: { x: dividerX, y: pairCenterY - logoPairHeight / 2 },
      end: { x: dividerX, y: pairCenterY + logoPairHeight / 2 },
      thickness: 1,
      color: onDarkMuted,
      opacity: 0.45,
    });

    page.drawImage(nurseryLogo, {
      x: pairLeftX + ownlyBlockWidth + dividerGap,
      y: pairCenterY - nurseryDrawHeight / 2,
      width: nurseryDrawWidth,
      height: nurseryDrawHeight,
    });
  }

  let y = pairCenterY - logoPairHeight / 2 - 30;
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
 * The Ownly mark and the nursery's own logo (if present), drawn flanking
 * the bottom caption/title band at `centerY` — Ownly on the right, the
 * nursery's logo on the left — instead of sitting in the page's top
 * corners over the illustration. Per the founder's explicit request: the
 * two marks sit beside the box the text is written in, not above it, and
 * neither is boxed in a white/dark backing plate any more — the nursery
 * logo is drawn as its own raw image (so it should be a transparent PNG
 * for a clean result; letterboxed to fit, never stretched) and the Ownly
 * mark as its bare vector rings + text, both directly over whatever's
 * behind them (the caption banner's flat colour on every page that has
 * one; the plain illustration itself on an Arabic-only page, which draws
 * no caption banner — see the bilingual/non-bilingual branching above).
 * `centerY` is always a fixed, low anchor (the same line as the page
 * number, or the equivalent spot on the cover) so this never has to know
 * which banner variant — if any — is behind it.
 */
function drawBrandBadges(
  page: PDFPage,
  textFont: PDFFont,
  nurseryLogo: PDFImage | null,
  centerY: number,
): void {
  const margin = BLEED_PT + 14;

  // Ownly mark, right side.
  const iconSize = 14;
  const textSize = 7.5;
  const text = 'Ownly';
  const textWidth = textFont.widthOfTextAtSize(text, textSize);
  const blockRight = PAGE_WIDTH_PT - margin;
  const iconCenterX = blockRight - textWidth - 4 - iconSize / 2;
  // Rings' own coordinates reach out to radius 36 from their local
  // centre, so scale against that (not iconSize) to land at the
  // intended on-page size.
  const F = iconSize / 2 / 36;

  RING_SVG_PATHS.forEach((path, index) => {
    page.drawSvgPath(path, {
      x: iconCenterX,
      y: centerY,
      scale: F,
      borderColor: WATERMARK_RING_COLORS[index],
      borderWidth: 8 * F,
      borderLineCap: LineCapStyle.Round,
    });
  });

  page.drawText(text, {
    x: iconCenterX + iconSize / 2 + 4,
    y: centerY - textSize / 2 + 1,
    size: textSize,
    font: textFont,
    color: INK_COLOR,
  });

  // Nursery logo, left side -- no backing plate, letterboxed to a fixed
  // height so varying logo aspect ratios don't overpower the Ownly mark.
  if (nurseryLogo) {
    const maxHeight = 22;
    const maxWidth = 74;
    const fitScale = Math.min(maxWidth / nurseryLogo.width, maxHeight / nurseryLogo.height);
    const drawWidth = nurseryLogo.width * fitScale;
    const drawHeight = nurseryLogo.height * fitScale;
    page.drawImage(nurseryLogo, {
      x: margin,
      y: centerY - drawHeight / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }
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
