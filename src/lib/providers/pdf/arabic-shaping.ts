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

export interface TextRun {
  text: string;
  isArabic: boolean;
}

/**
 * Splits an already-shaped, visually-reordered line (the output of
 * shapeArabicForPdf) into maximal same-script runs.
 *
 * Why this exists: pdf-lib's CustomFontEmbedder calls fontkit's own
 * `font.layout()` to turn a string into glyphs (see
 * node_modules/pdf-lib/.../CustomFontEmbedder.js), and that call performs
 * its OWN bidi pass — on top of the reordering shapeArabicForPdf already
 * did. Latin runs embedded in Arabic text (a child's name, an
 * organisation name) get reversed by fontkit's pass even though
 * shapeArabicForPdf already placed them correctly — verified by
 * rendering "...Hala عند باب test..." and seeing "alaH"/"tset" in the
 * rasterised output. fontkit's bidi only kicks in when a single
 * `drawText` call mixes directions; a call containing only one script
 * has nothing for it to "fix". So each run must be drawn as its own
 * `drawText` call — see render.ts's drawShapedLine.
 */
export function splitIntoDirectionRuns(shapedVisualLine: string): TextRun[] {
  const runs: TextRun[] = [];
  let current = '';
  let currentIsArabic: boolean | null = null;

  for (const char of shapedVisualLine) {
    const isArabicChar = ARABIC_BLOCK.test(char);
    const isDirectional = isArabicChar || /[A-Za-z0-9]/.test(char);
    // Spaces/punctuation are direction-neutral — they stay glued to
    // whichever run is currently open rather than forcing a split.
    if (currentIsArabic === null || !isDirectional || isArabicChar === currentIsArabic) {
      current += char;
      if (isDirectional) currentIsArabic = isArabicChar;
    } else {
      runs.push({ text: current, isArabic: currentIsArabic! });
      current = char;
      currentIsArabic = isArabicChar;
    }
  }
  if (current) runs.push({ text: current, isArabic: currentIsArabic ?? false });
  return runs;
}
