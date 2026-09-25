const ARABIC_BLOCK = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function containsArabic(text: string): boolean {
  return ARABIC_BLOCK.test(text);
}

export interface TextRun {
  text: string;
  isArabic: boolean;
}

/**
 * Splits LOGICAL (un-shaped) text into maximal same-script runs, so each
 * run can be shaped independently — see harfbuzz-shape.ts and
 * drawArabicLine in render.ts. A real shaping engine (HarfBuzz) shapes
 * one direction at a time; it does not perform Unicode bidi paragraph
 * analysis, so a single shape() call over a whole mixed-direction line
 * (Arabic prose with an embedded Latin child's/organisation's name)
 * reverses the embedded Latin run's own character order — confirmed by
 * rendering "...Hala..." through HarfBuzz as one RTL-direction buffer and
 * getting "alaH" back. Splitting into same-script runs first, shaping
 * each with its own correct direction, and drawing them left-to-right in
 * (reversed) visual order avoids this entirely.
 */
export function splitIntoDirectionRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let current = '';
  let currentIsArabic: boolean | null = null;

  for (const char of text) {
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
