import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as hb from 'harfbuzzjs';
import {
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  type PDFPage,
} from 'pdf-lib';

const REGULAR_FONT_PATH = join(process.cwd(), 'assets', 'fonts', 'NotoNaskhArabic-Regular-Static.ttf');
const BOLD_FONT_PATH = join(process.cwd(), 'assets', 'fonts', 'NotoNaskhArabic-Bold-Static.ttf');

interface LoadedFont {
  font: InstanceType<typeof hb.Font>;
  upem: number;
}

let regularPromise: Promise<LoadedFont> | null = null;
let boldPromise: Promise<LoadedFont> | null = null;

async function loadFont(path: string): Promise<LoadedFont> {
  const bytes = await readFile(path);
  const blob = new hb.Blob(bytes);
  const face = new hb.Face(blob);
  const font = new hb.Font(face);
  return { font, upem: face.upem };
}

function getFont(bold: boolean): Promise<LoadedFont> {
  if (bold) {
    if (!boldPromise) boldPromise = loadFont(BOLD_FONT_PATH);
    return boldPromise;
  }
  if (!regularPromise) regularPromise = loadFont(REGULAR_FONT_PATH);
  return regularPromise;
}

interface ShapedGlyph {
  glyphId: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

function shapeLine(font: InstanceType<typeof hb.Font>, text: string): ShapedGlyph[] {
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  return infos.map((info, i) => ({
    glyphId: info.codepoint,
    xAdvance: positions[i]!.xAdvance,
    xOffset: positions[i]!.xOffset,
    yOffset: positions[i]!.yOffset,
  }));
}

function lineWidthPt(glyphs: ShapedGlyph[], unitScale: number): number {
  return glyphs.reduce((sum, g) => sum + g.xAdvance * unitScale, 0);
}

function wrapLines(
  font: InstanceType<typeof hb.Font>,
  unitScale: number,
  text: string,
  maxWidthPt: number,
): string[] {
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (lineWidthPt(shapeLine(font, candidate), unitScale) > maxWidthPt && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface ArabicTextOptions {
  centerX: number;
  /** Top of the text block (not a text baseline). */
  topY: number;
  fontSizePt: number;
  maxWidthPt: number;
  color?: string;
  bold?: boolean;
}

/**
 * Draws `text` centered, word-wrapped to `maxWidthPt`, as real filled
 * vector glyph outlines shaped by HarfBuzz — not rasterized, not drawn
 * via pdf-lib/fontkit's own text-drawing (see render.ts's docstring for
 * why that path was never usable for Arabic). HarfBuzz is a real
 * OpenType shaping engine: it gets letter joining (initial/medial/
 * final/isolated forms) AND GPOS mark-to-base positioning correct,
 * which satori (tried first for this feature, see docs/DECISIONS.md
 * "Arabic PDF text: HarfBuzz + pdf-lib vector glyphs") does NOT —
 * satori left the dots on ق/ف/ن floating disconnected from their base
 * letters, confirmed by rendering a real PDF and visually inspecting it,
 * not assumed from a simpler test string.
 *
 * Each shaped glyph's outline comes back from HarfBuzz as an SVG-syntax
 * path string (`font.glyphToPath`) in a Y-down coordinate space, flipped
 * here around each glyph's own draw position before handing it to
 * pdf-lib's `drawSvgPath` — confirmed empirically (the unflipped output
 * rendered upside-down), not assumed from the ring-logo path elsewhere
 * in this file (that path is Y-up, hand-authored, unrelated to font
 * glyph outlines).
 *
 * Returns the new current Y (bottom of the drawn text block) so callers
 * can stack further content below without hand-computing line counts.
 */
export async function drawCenteredArabicText(
  page: PDFPage,
  text: string,
  { centerX, topY, fontSizePt, maxWidthPt, color = '#241c16', bold = false }: ArabicTextOptions,
): Promise<number> {
  const { font, upem } = await getFont(bold);
  const unitScale = fontSizePt / upem;
  const fillColor = hexToRgb(color);
  const lineHeight = fontSizePt * 1.55;

  const lines = wrapLines(font, unitScale, text, maxWidthPt);

  // topY is the top of the block; the first line's baseline sits roughly
  // one cap-height below it, matching the visual weight of the Latin
  // headings this sits alongside (drawCenteredLatinText takes a baseline
  // y directly) — tuned by rendering a real sample PDF, not computed
  // from font metrics alone.
  let baselineY = topY - fontSizePt * 0.92;

  for (const line of lines) {
    const glyphs = shapeLine(font, line);
    const totalWidth = lineWidthPt(glyphs, unitScale);
    let penX = centerX - totalWidth / 2;

    for (const glyph of glyphs) {
      const path = font.glyphToPath(glyph.glyphId);
      if (path) {
        const glyphX = penX + glyph.xOffset * unitScale;
        const glyphY = baselineY + glyph.yOffset * unitScale;
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, glyphX, glyphY));
        page.drawSvgPath(path, { x: 0, y: 0, scale: unitScale, color: fillColor });
        page.pushOperators(popGraphicsState());
      }
      penX += glyph.xAdvance * unitScale;
    }

    baselineY -= lineHeight;
  }

  // baselineY has already been advanced one full lineHeight past the last
  // drawn line (it's where the NEXT, undrawn line's baseline would sit) --
  // that already clears this font's unusually tall descent (0.63x the em
  // size per NotoNaskhArabic's hhea table, well inside the 1.55x line
  // height), so callers get it back as-is rather than partially undone.
  return baselineY + fontSizePt * 0.25;
}
