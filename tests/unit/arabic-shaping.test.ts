import { describe, expect, it } from 'vitest';
import { containsArabic, shapeArabicForPdf, splitIntoDirectionRuns } from '@/lib/providers/pdf/arabic-shaping';

describe('containsArabic', () => {
  it('detects Arabic script', () => {
    expect(containsArabic('مرحبا')).toBe(true);
  });

  it('returns false for plain Latin text', () => {
    expect(containsArabic('Hello there')).toBe(false);
  });
});

describe('shapeArabicForPdf', () => {
  it('changes the codepoints (reshapes to presentation forms) for real Arabic text', () => {
    const input = 'السلام عليكم';
    const output = shapeArabicForPdf(input);
    expect(output).not.toBe(input);
    expect(output.length).toBeGreaterThan(0);
  });

  it('keeps embedded Latin digits in left-to-right reading order', () => {
    const output = shapeArabicForPdf('مرحبا 123 صديقي');
    expect(output).toContain('123');
  });

  it('is deterministic for the same input', () => {
    const text = 'قصة جميلة عن الصدق';
    expect(shapeArabicForPdf(text)).toBe(shapeArabicForPdf(text));
  });
});

describe('splitIntoDirectionRuns', () => {
  // Real bug this guards against: pdf-lib's CustomFontEmbedder calls
  // fontkit's own font.layout(), which does its OWN bidi pass on
  // whatever string it's given. Drawing a shaped/reordered line that
  // still mixes Arabic and Latin in ONE drawText call let fontkit
  // re-reverse the embedded Latin run — "Hala" came out as "alaH", "test"
  // as "tset" — even though shapeArabicForPdf had already placed them
  // correctly. Confirmed by rendering to an actual PDF and rasterising
  // it; this test guards the piece that's actually assertable: each
  // embedded Latin run must survive as one intact, correctly-ordered run.
  it('keeps an embedded Latin name intact as its own run, not split or reversed', () => {
    const shaped = shapeArabicForPdf('وقف Hala عند باب test، وهو يمسك حقيبته بقوة.');
    const runs = splitIntoDirectionRuns(shaped);
    const runTexts = runs.map((r) => r.text.trim());

    expect(runTexts.some((t) => t.includes('Hala'))).toBe(true);
    expect(runTexts.some((t) => t.includes('test'))).toBe(true);
    expect(runTexts.some((t) => t.includes('alaH'))).toBe(false);
    expect(runTexts.some((t) => t.includes('tset'))).toBe(false);

    const latinRuns = runs.filter((r) => !r.isArabic && /[A-Za-z]/.test(r.text));
    expect(latinRuns.map((r) => r.text.trim())).toEqual(['test', 'Hala']);
  });

  it('reassembles back to the exact input when runs are concatenated in order', () => {
    const shaped = shapeArabicForPdf('قالت ماريا الثعلبة وهي تجلس بجانب Hala');
    const runs = splitIntoDirectionRuns(shaped);
    expect(runs.map((r) => r.text).join('')).toBe(shaped);
  });

  it('returns a single run for pure Arabic text with no embedded Latin', () => {
    const shaped = shapeArabicForPdf('أكلت مايا الخضروات الملونة.');
    const runs = splitIntoDirectionRuns(shaped);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.isArabic).toBe(true);
  });
});
