import 'server-only';

/**
 * Real Arabic text shaping via HarfBuzz (WASM), replacing an earlier
 * approach that pre-converted Arabic to presentation-form codepoints
 * (via `arabic-reshaper`) and bidi-reordered them (via `bidi-js`) before
 * handing them to pdf-lib's `page.drawText`.
 *
 * That approach produced visibly disconnected Arabic letters in the
 * final PDF — confirmed by rendering to an actual PDF and rasterising it,
 * then comparing pixel-for-pixel against the same text rendered by a real
 * shaping engine (Chromium/HarfBuzz) from the SAME embedded font file.
 * Root cause, confirmed with HarfBuzz's own shaping output for comparison:
 * this font (NotoNaskhArabic) represents several letters (e.g. ق ت ف ب) as
 * a dotless base glyph plus a separate combining dot-mark glyph, positioned
 * via the font's GPOS `mark` feature — real Arabic shaping engines apply
 * that positioning; feeding pre-selected Arabic Presentation Forms
 * (`arabic-reshaper`'s output) into pdf-lib's `page.drawText` bypasses this
 * entirely, since presentation-form codepoints resolve to the font's
 * "compatibility" glyphs, not the correctly-joined/positioned ones a real
 * shaper produces from the original base letters. See docs/DECISIONS.md
 * "Arabic PDF text shaping" for the full investigation.
 *
 * HarfBuzz shapes ONE direction at a time — it does not perform Unicode
 * bidi paragraph analysis. Mixed-direction text (a Latin child's/
 * organisation's name embedded in an Arabic sentence) must still be split
 * into same-script runs and shaped per-run (see `splitIntoDirectionRuns`
 * in arabic-shaping.ts); shaping a whole mixed-direction buffer in one
 * call reverses the embedded Latin run's own character order (confirmed:
 * "Hala" came out as "alaH").
 */

export interface ShapedGlyph {
  glyphId: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface ShapedRun {
  glyphs: ShapedGlyph[];
  widthInFontUnits: number;
}

interface HbFontHandle {
  hb: HarfbuzzModule;
  font: HbFont;
  upem: number;
}

// Minimal shape of the parts of harfbuzzjs's API this module uses.
interface HarfbuzzModule {
  Blob: new (bytes: Uint8Array) => unknown;
  Face: new (blob: unknown) => { upem: number };
  Font: new (face: unknown) => HbFont;
  Buffer: new () => HbBuffer;
  Direction: { LTR: number; RTL: number };
  shape: (font: HbFont, buffer: HbBuffer) => void;
}

interface HbFont {
  setScale(x: number, y: number): void;
}

interface HbBuffer {
  addText(text: string): void;
  setDirection(direction: number): void;
  setScript(script: string): void;
  getGlyphInfos(): Array<{ codepoint: number }>;
  getGlyphPositions(): Array<{ xAdvance: number; xOffset: number; yOffset: number }>;
}

const fontHandleCache = new Map<string, Promise<HbFontHandle>>();

async function loadHbFont(fontBytes: Uint8Array, cacheKey: string): Promise<HbFontHandle> {
  const cached = fontHandleCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const hb = (await import('harfbuzzjs')) as unknown as HarfbuzzModule;
    const blob = new hb.Blob(fontBytes);
    const face = new hb.Face(blob);
    const font = new hb.Font(face);
    font.setScale(face.upem, face.upem);
    return { hb, font, upem: face.upem };
  })();

  fontHandleCache.set(cacheKey, promise);
  return promise;
}

/** Returns the font's units-per-em, needed to convert shaped advances/offsets into points. */
export async function getFontUpem(fontBytes: Uint8Array, cacheKey: string): Promise<number> {
  const { upem } = await loadHbFont(fontBytes, cacheKey);
  return upem;
}

/**
 * Shapes one same-direction run of text with a real shaping engine,
 * returning each glyph's ID plus its advance/offset in font units
 * (scaled to the font's own unitsPerEm — see `getFontUpem`).
 */
export async function shapeRun(
  fontBytes: Uint8Array,
  cacheKey: string,
  text: string,
  direction: 'ltr' | 'rtl',
): Promise<ShapedRun> {
  const { hb, font } = await loadHbFont(fontBytes, cacheKey);
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.setDirection(direction === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
  buffer.setScript(direction === 'rtl' ? 'arab' : 'latn');
  hb.shape(font, buffer);

  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  const glyphs: ShapedGlyph[] = infos.map((info, i) => ({
    glyphId: info.codepoint,
    xAdvance: positions[i]!.xAdvance,
    xOffset: positions[i]!.xOffset,
    yOffset: positions[i]!.yOffset,
  }));
  const widthInFontUnits = glyphs.reduce((sum, g) => sum + g.xAdvance, 0);
  return { glyphs, widthInFontUnits };
}
