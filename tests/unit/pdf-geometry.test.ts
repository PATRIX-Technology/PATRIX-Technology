import { describe, expect, it } from 'vitest';
import { BLEED_PT, PAGE_HEIGHT_PT, PAGE_WIDTH_PT, TRIM_HEIGHT_PT, TRIM_WIDTH_PT, mmToPt } from '@/lib/providers/pdf/geometry';

describe('PDF geometry', () => {
  it('converts mm to pt using the standard 72/25.4 factor', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 5);
  });

  it('computes A5 trim size correctly in points', () => {
    expect(TRIM_WIDTH_PT).toBeCloseTo(419.53, 1);
    expect(TRIM_HEIGHT_PT).toBeCloseTo(595.28, 1);
  });

  it('adds exactly 3mm of bleed on every edge', () => {
    expect(BLEED_PT).toBeCloseTo(mmToPt(3), 5);
    expect(PAGE_WIDTH_PT).toBeCloseTo(TRIM_WIDTH_PT + 2 * BLEED_PT, 5);
    expect(PAGE_HEIGHT_PT).toBeCloseTo(TRIM_HEIGHT_PT + 2 * BLEED_PT, 5);
  });
});
