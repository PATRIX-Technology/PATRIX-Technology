/**
 * The TooniX mark: two overlapping four-point sparkles — a bigger teal
 * one and a smaller coral one tucked behind its top-right tip, plus a
 * small gold accent dot. The two overlapping sparkles read as "every
 * child gets their own story" (two sparks, not one), and their crossed
 * diagonal arms echo the "X" in the name without drawing a literal
 * X/cross glyph (which reads as a cancel/delete icon at small sizes —
 * deliberately avoided). Rendered as inline SVG (not a static PNG) so
 * it scales crisply from a 16px favicon up to a PDF cover page.
 * `variant="default"` draws its own dark rounded-square badge (self-
 * contained, safe on any background — light pages, print, app-icon
 * use); `variant="flat"` skips the badge and draws the mark directly,
 * for surfaces that are already dark (e.g. the dashboard nav), where
 * the badge would just be a dark square on a dark square.
 */
const SPARKLE_PATH = 'M0,-19 C2,-7 5,-2 18,0 C5,2 2,7 0,19 C-2,7 -5,2 -18,0 C-5,-2 -2,-7 0,-19 Z';

export function Logo({
  size = 32,
  variant = 'default',
  className = '',
}: {
  size?: number;
  variant?: 'default' | 'flat';
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="TooniX"
    >
      {variant === 'default' && <rect width="100" height="100" rx="24" fill="#14152B" />}
      <path d={SPARKLE_PATH} transform="translate(68,32) rotate(18) scale(1.05)" fill="#E2708A" />
      <path d={SPARKLE_PATH} transform="translate(48,52) scale(1.85)" fill="#2FBFA6" />
      <circle cx="82" cy="66" r="3.2" fill="#E3AC3D" />
    </svg>
  );
}
