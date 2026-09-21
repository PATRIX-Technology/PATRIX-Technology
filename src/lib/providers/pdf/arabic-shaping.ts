import arabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

/**
 * pdf-lib (and the underlying fontkit text layout it uses) does not
 * perform Arabic contextual shaping or bidirectional reordering — it
 * simply places one glyph per codepoint left-to-right. This function
 * pre-shapes Arabic text into the correct Arabic Presentation Forms
 * (initial/medial/final/isolated glyph variants) and reorders it into
 * left-to-right VISUAL order, so drawing the result with a plain
 * left-to-right `drawText` call renders correctly.
 *
 * This is a pragmatic approach, not a full ICU-grade bidi/shaping engine.
 * It handles the common case (a paragraph of Arabic prose, optionally
 * containing Latin digits/punctuation) correctly, per the manual test in
 * docs/TEST_CHECKLIST.md. Any oddities in more complex mixed-script
 * strings should be caught during native review before a real print run.
 */
export function shapeArabicForPdf(text: string): string {
  const shaped = arabicReshaper.convertArabic(text);
  const embeddingLevels = bidi.getEmbeddingLevels(shaped);
  return bidi.getReorderedString(shaped, embeddingLevels);
}

const ARABIC_BLOCK = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function containsArabic(text: string): boolean {
  return ARABIC_BLOCK.test(text);
}
