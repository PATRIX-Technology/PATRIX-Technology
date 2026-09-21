export const MM_TO_PT = 72 / 25.4;
export const DPI = 300;

export const TRIM_WIDTH_MM = 148; // A5 portrait
export const TRIM_HEIGHT_MM = 210;
export const BLEED_MM = 3;

export const BLEED_PT = BLEED_MM * MM_TO_PT;
export const TRIM_WIDTH_PT = TRIM_WIDTH_MM * MM_TO_PT;
export const TRIM_HEIGHT_PT = TRIM_HEIGHT_MM * MM_TO_PT;

/** MediaBox size: trim size plus bleed on all four edges. */
export const PAGE_WIDTH_PT = TRIM_WIDTH_PT + BLEED_PT * 2;
export const PAGE_HEIGHT_PT = TRIM_HEIGHT_PT + BLEED_PT * 2;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

/** Pixel dimensions a raster image must meet to print at true 300 DPI
 * across the full bleed-inclusive page. */
export const MIN_IMAGE_WIDTH_PX = Math.round((PAGE_WIDTH_PT / 72) * DPI);
export const MIN_IMAGE_HEIGHT_PX = Math.round((PAGE_HEIGHT_PT / 72) * DPI);

export const DIMENSION_TOLERANCE_PT = 0.5;
