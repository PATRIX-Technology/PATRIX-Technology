import { describe, expect, it } from 'vitest';
import { containsArabic, shapeArabicForPdf } from '@/lib/providers/pdf/arabic-shaping';

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
