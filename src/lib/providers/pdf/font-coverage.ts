import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppLocale } from '@/types/database';

const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');

// Lazily loaded and cached — these are the exact same font files
// fonts.ts embeds into the PDF, loaded here as plain fontkit Font
// objects (no PDFDocument needed) purely to query real glyph coverage.
let latinFont: ReturnType<typeof fontkit.create> | null = null;
let arabicFont: ReturnType<typeof fontkit.create> | null = null;

function getLatinFont() {
  if (!latinFont) {
    latinFont = fontkit.create(readFileSync(join(FONTS_DIR, 'Inter-Regular-Static.ttf')));
  }
  return latinFont;
}

function getArabicFont() {
  if (!arabicFont) {
    arabicFont = fontkit.create(readFileSync(join(FONTS_DIR, 'NotoNaskhArabic-Regular-Static.ttf')));
  }
  return arabicFont;
}

// Control/format characters (newlines, ZWJ/ZWNJ, BOM, ...) are never
// drawn as a visible glyph regardless of what render.ts does with them,
// so whether the font happens to have a glyph for them is irrelevant.
function isControlOrFormatChar(codePoint: number): boolean {
  return (
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x200b || // zero-width space
    codePoint === 0x200c || // ZWNJ
    codePoint === 0x200d || // ZWJ
    codePoint === 0xfeff // BOM
  );
}

/**
 * Whether the font render.ts actually uses for this locale's captions
 * has a real glyph for this character (checked against the font's
 * real coverage via fontkit, not a hand-maintained allow-list regex).
 * A hardcoded regex here previously rejected characters the font could
 * render perfectly well — an em dash or en dash, both common in
 * AI-generated prose — which made preflight fail real, renderable PDFs.
 * `char` must be a single Unicode code point (e.g. one iteration of
 * `for (const char of text)`, which iterates by code point, not UTF-16
 * code unit, so this handles astral characters correctly too).
 */
export function isCharacterSupported(char: string, locale: AppLocale): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined || isControlOrFormatChar(codePoint)) return true;
  const font = locale === 'ar' ? getArabicFont() : getLatinFont();
  return font.hasGlyphForCodePoint(codePoint);
}
