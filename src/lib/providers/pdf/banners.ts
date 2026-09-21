import 'server-only';
import type { PDFPage, Color } from 'pdf-lib';

/**
 * Draws a horizontal row of overlapping filled circles, all the same
 * color, with no border. Adjacent same-color fills leave no visible seam,
 * so a row of circles reads as one continuous scalloped/wavy edge — this
 * is the whole trick behind every banner shape in this file, chosen over
 * hand-rolled SVG arc paths because it is trivial to get right and to
 * reason about.
 */
function drawScallopRow(
  page: PDFPage,
  opts: { fromX: number; toX: number; y: number; radius: number; color: Color; opacity?: number },
): void {
  const { fromX, toX, y, radius, color, opacity } = opts;
  const span = toX - fromX;
  const count = Math.max(3, Math.round(span / (radius * 1.6)));
  for (let i = 0; i <= count; i++) {
    const x = fromX + (span * i) / count;
    page.drawCircle({ x, y, size: radius, color, opacity });
  }
}

/**
 * A free-floating ribbon/cloud banner with a scalloped top AND bottom edge
 * and softly rounded ends — used for the story-title banner that repeats
 * at the top of every illustrated page, matching the reference sample's
 * "sticker" title treatment.
 */
export function drawFreeFloatingBanner(
  page: PDFPage,
  opts: {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    bumpRadius: number;
    color: Color;
    opacity?: number;
  },
): void {
  const { centerX, centerY, width, height, bumpRadius, color, opacity } = opts;
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const topRowY = centerY + height / 2 - bumpRadius;
  const bottomRowY = centerY - height / 2 + bumpRadius;
  const bodyHeight = Math.max(topRowY - bottomRowY, 0);

  page.drawRectangle({ x: left, y: bottomRowY, width: right - left, height: bodyHeight, color, opacity });

  const capRadius = bodyHeight / 2 + bumpRadius * 0.4;
  page.drawCircle({ x: left, y: centerY, size: capRadius, color, opacity });
  page.drawCircle({ x: right, y: centerY, size: capRadius, color, opacity });

  drawScallopRow(page, { fromX: left, toX: right, y: topRowY, radius: bumpRadius, color, opacity });
  drawScallopRow(page, { fromX: left, toX: right, y: bottomRowY, radius: bumpRadius, color, opacity });
}

/**
 * A full-width band flush with the bottom of the page, flat along the
 * bottom and sides, scalloped only along its top edge — used for the soft
 * pastel caption band that carries each page's story text, matching the
 * reference sample.
 */
export function drawFlatBottomBanner(
  page: PDFPage,
  opts: { x: number; width: number; topY: number; bumpRadius: number; color: Color; opacity?: number },
): void {
  const { x, width, topY, bumpRadius, color, opacity } = opts;
  page.drawRectangle({ x, y: 0, width, height: topY, color, opacity });
  drawScallopRow(page, { fromX: x, toX: x + width, y: topY, radius: bumpRadius, color, opacity });
}
