import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shapeRun, getFontUpem } from '@/lib/providers/pdf/harfbuzz-shape';

const FONT_PATH = join(process.cwd(), 'assets', 'fonts', 'NotoNaskhArabic-Regular-Static.ttf');

// Real regression this guards against: pdf-lib/fontkit's own text layout
// (page.drawText) does not apply this font's Arabic joining correctly —
// confirmed by rendering to an actual PDF, rasterising it, and comparing
// pixel-for-pixel against the same text rendered by a real shaping engine
// (Chromium/HarfBuzz) from the same font file. HarfBuzz shaping is the
// fix; this test asserts the specific mechanism that made the difference:
// this font represents letters like ق and ت as a dotless base glyph plus
// a separately-positioned combining dot mark (via the font's GPOS `mark`
// feature), and a real shaper must report non-zero positioning offsets
// for those marks so they land on their base letter instead of floating
// off to one side. See docs/DECISIONS.md "Arabic PDF text shaping".
describe('shapeRun', () => {
  it('positions combining dot-marks with non-zero offsets for a word that needs them', async () => {
    const fontBytes = await readFile(FONT_PATH);
    const shaped = await shapeRun(fontBytes, 'test-noto-naskh', 'قالت', 'rtl');

    expect(shaped.glyphs.length).toBeGreaterThan(4); // dotless bases + separate mark glyphs
    const hasPositionedMark = shaped.glyphs.some(
      (g) => g.xAdvance === 0 && (g.xOffset !== 0 || g.yOffset !== 0),
    );
    expect(hasPositionedMark).toBe(true);
  });

  it('shapes a pure-Latin run left-to-right with no offsets needed', async () => {
    const fontBytes = await readFile(FONT_PATH);
    const shaped = await shapeRun(fontBytes, 'test-noto-naskh', 'Hala', 'ltr');

    expect(shaped.glyphs).toHaveLength(4);
    expect(shaped.widthInFontUnits).toBeGreaterThan(0);
  });

  it('is deterministic for the same input', async () => {
    const fontBytes = await readFile(FONT_PATH);
    const a = await shapeRun(fontBytes, 'test-noto-naskh', 'مرحبا', 'rtl');
    const b = await shapeRun(fontBytes, 'test-noto-naskh', 'مرحبا', 'rtl');
    expect(a.glyphs.map((g) => g.glyphId)).toEqual(b.glyphs.map((g) => g.glyphId));
    expect(a.widthInFontUnits).toBe(b.widthInFontUnits);
  });
});

describe('getFontUpem', () => {
  it('returns a plausible units-per-em value', async () => {
    const fontBytes = await readFile(FONT_PATH);
    const upem = await getFontUpem(fontBytes, 'test-noto-naskh-upem');
    expect(upem).toBeGreaterThanOrEqual(1000);
  });
});
