import { describe, expect, it } from 'vitest';
import { isCharacterSupported } from '@/lib/providers/pdf/font-coverage';

describe('isCharacterSupported', () => {
  // Regression case: a hardcoded regex previously rejected characters
  // the embedded fonts actually render fine — an em dash or en dash,
  // both common in AI-generated prose — which failed real, renderable
  // PDFs at preflight. Checking real glyph coverage instead of guessing
  // with a character-class list is the fix.
  it('accepts em dash and en dash for both locales (both fonts actually have these glyphs)', () => {
    expect(isCharacterSupported('—', 'en')).toBe(true);
    expect(isCharacterSupported('–', 'en')).toBe(true);
    expect(isCharacterSupported('—', 'ar')).toBe(true);
    expect(isCharacterSupported('–', 'ar')).toBe(true);
  });

  it('accepts ordinary Latin letters, digits, and curly quotes', () => {
    for (const char of ['a', 'Z', '5', '’', '“', '”', '…']) {
      expect(isCharacterSupported(char, 'en')).toBe(true);
    }
  });

  it('accepts Arabic letters and diacritics', () => {
    for (const char of ['ا', 'ب', 'ﻻ', 'َ' /* fatha */]) {
      expect(isCharacterSupported(char, 'ar')).toBe(true);
    }
  });

  it('treats control/format characters as trivially supported since nothing draws them', () => {
    expect(isCharacterSupported('\n', 'en')).toBe(true);
    expect(isCharacterSupported('‌' /* ZWNJ */, 'en')).toBe(true);
    expect(isCharacterSupported('﻿' /* BOM */, 'ar')).toBe(true);
  });

  it('rejects a character genuinely missing from the embedded font', () => {
    // A CJK ideograph — neither Inter's nor Noto Naskh Arabic's static
    // instance embeds CJK glyphs.
    expect(isCharacterSupported('漢', 'en')).toBe(false);
    expect(isCharacterSupported('😀', 'en')).toBe(false);
  });
});
