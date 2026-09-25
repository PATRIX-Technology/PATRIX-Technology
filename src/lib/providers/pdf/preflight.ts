import { PDFDocument, PDFName, PDFArray, PDFNumber } from 'pdf-lib';
import { BLEED_PT, DIMENSION_TOLERANCE_PT, PAGE_HEIGHT_PT, PAGE_WIDTH_PT } from './geometry';
import type { AppLocale } from '@/types/database';
import { containsArabic } from './arabic-shaping';
import { isCharacterSupported } from './font-coverage';

export interface PreflightIssue {
  code:
    | 'WRONG_DIMENSIONS'
    | 'MISSING_BLEED_BOX'
    | 'MISSING_ASSET'
    | 'UNSUPPORTED_CHARACTER'
    | 'EMPTY_DOCUMENT'
    | 'PAGE_COUNT_MISMATCH';
  page?: number;
  message: string;
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
}

export interface PreflightInput {
  pdfBytes: Uint8Array;
  expectedPageCount: number;
  locale: AppLocale;
  pageTexts: string[];
  missingAssetPageNumbers: number[];
}

/**
 * Fails LOUDLY: this is called before a PDF is allowed to reach
 * stories.pdf_asset_path / be offered for download, per the product
 * requirement that broken print files must never silently ship.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];

  if (input.missingAssetPageNumbers.length > 0) {
    for (const pageNumber of input.missingAssetPageNumbers) {
      issues.push({
        code: 'MISSING_ASSET',
        page: pageNumber,
        message: `Page ${pageNumber} has no generated (and approved) image asset.`,
      });
    }
  }

  for (const [index, text] of input.pageTexts.entries()) {
    const unsupportedChars = [...text].filter((char) => !isCharacterSupported(char, input.locale));
    if (unsupportedChars.length > 0) {
      const distinct = [...new Set(unsupportedChars)];
      issues.push({
        code: 'UNSUPPORTED_CHARACTER',
        page: index + 1,
        message: `Page ${index + 1} text contains characters the embedded font has no glyph for: ${distinct
          .map((c) => `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase()})`)
          .join(', ')}.`,
      });
    }
    if (input.locale === 'en' && containsArabic(text)) {
      issues.push({
        code: 'UNSUPPORTED_CHARACTER',
        page: index + 1,
        message: `Page ${index + 1} is marked English but contains Arabic characters.`,
      });
    }
  }

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(input.pdfBytes);
  } catch {
    return { ok: false, issues: [{ code: 'EMPTY_DOCUMENT', message: 'The PDF could not be parsed.' }] };
  }

  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    issues.push({ code: 'EMPTY_DOCUMENT', message: 'The generated PDF has no pages.' });
  } else if (pages.length !== input.expectedPageCount) {
    issues.push({
      code: 'PAGE_COUNT_MISMATCH',
      message: `Expected ${input.expectedPageCount} pages (one per story page), found ${pages.length}.`,
    });
  }

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    if (
      Math.abs(width - PAGE_WIDTH_PT) > DIMENSION_TOLERANCE_PT ||
      Math.abs(height - PAGE_HEIGHT_PT) > DIMENSION_TOLERANCE_PT
    ) {
      issues.push({
        code: 'WRONG_DIMENSIONS',
        page: index + 1,
        message: `Page ${index + 1} is ${width.toFixed(2)}x${height.toFixed(2)}pt, expected ${PAGE_WIDTH_PT.toFixed(2)}x${PAGE_HEIGHT_PT.toFixed(2)}pt (A5 trim + 3mm bleed).`,
      });
    }

    const trimBox = page.node.get(PDFName.of('TrimBox'));
    if (!(trimBox instanceof PDFArray) || trimBox.size() !== 4) {
      issues.push({
        code: 'MISSING_BLEED_BOX',
        page: index + 1,
        message: `Page ${index + 1} is missing a TrimBox — bleed cannot be verified by a print vendor.`,
      });
    } else {
      const values = [0, 1, 2, 3].map((i) => (trimBox.get(i) as PDFNumber).asNumber());
      const trimWidth = values[2]! - values[0]!;
      const trimHeight = values[3]! - values[1]!;
      const expectedBleedLeft = values[0]!;
      if (Math.abs(expectedBleedLeft - BLEED_PT) > DIMENSION_TOLERANCE_PT) {
        issues.push({
          code: 'MISSING_BLEED_BOX',
          page: index + 1,
          message: `Page ${index + 1} TrimBox is not inset by the required 3mm bleed.`,
        });
      }
      void trimWidth;
      void trimHeight;
    }
  });

  return { ok: issues.length === 0, issues };
}
