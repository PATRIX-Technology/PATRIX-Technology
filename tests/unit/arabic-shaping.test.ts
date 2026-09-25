import { describe, expect, it } from 'vitest';
import { containsArabic, splitIntoDirectionRuns } from '@/lib/providers/pdf/arabic-shaping';

describe('containsArabic', () => {
  it('detects Arabic script', () => {
    expect(containsArabic('مرحبا')).toBe(true);
  });

  it('returns false for plain Latin text', () => {
    expect(containsArabic('Hello there')).toBe(false);
  });
});

describe('splitIntoDirectionRuns', () => {
  // Real bug this guards against: a real shaping engine (HarfBuzz) shapes
  // one direction at a time, and doesn't perform Unicode bidi paragraph
  // analysis itself — shaping a whole mixed-direction line as one buffer
  // reverses the embedded Latin run's own character order ("Hala" came
  // out as "alaH"). Splitting into same-script runs first and shaping
  // each with its own correct direction (see render.ts's drawArabicLine)
  // avoids this; this test guards the piece that's actually assertable:
  // each embedded Latin run must survive as its own intact run.
  it('keeps an embedded Latin name intact as its own run, not merged into the Arabic text', () => {
    const runs = splitIntoDirectionRuns('وقف Hala عند باب test، وهو يمسك حقيبته بقوة.');
    const runTexts = runs.map((r) => r.text.trim());

    expect(runTexts.some((t) => t.includes('Hala'))).toBe(true);
    expect(runTexts.some((t) => t.includes('test'))).toBe(true);

    const latinRuns = runs.filter((r) => !r.isArabic && /[A-Za-z]/.test(r.text));
    expect(latinRuns.map((r) => r.text.trim())).toEqual(['Hala', 'test']);
  });

  it('reassembles back to the exact input when runs are concatenated in order', () => {
    const text = 'قالت ماريا الثعلبة وهي تجلس بجانب Hala';
    const runs = splitIntoDirectionRuns(text);
    expect(runs.map((r) => r.text).join('')).toBe(text);
  });

  it('returns a single run for pure Arabic text with no embedded Latin', () => {
    const text = 'أكلت مايا الخضروات الملونة.';
    const runs = splitIntoDirectionRuns(text);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.isArabic).toBe(true);
  });
});
