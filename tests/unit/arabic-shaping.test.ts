import { describe, expect, it } from 'vitest';
import { containsArabic } from '@/lib/providers/pdf/arabic-shaping';

describe('containsArabic', () => {
  it('detects Arabic script', () => {
    expect(containsArabic('مرحبا')).toBe(true);
  });

  it('returns false for plain Latin text', () => {
    expect(containsArabic('Hello there')).toBe(false);
  });
});
