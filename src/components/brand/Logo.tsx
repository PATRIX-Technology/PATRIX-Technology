/**
 * The Ownly mark: three open, nested arcs (teal outer, coral middle,
 * saffron inner) with a shared gap, like a fingerprint whorl or an
 * open "O" — standing in for the name's own meaning ("the one story
 * that's truly theirs," as unique as a fingerprint). Each ring is
 * deliberately an open arc, not a closed circle, so the mark reads as
 * its own thing rather than echoing an unrelated existing "concentric
 * rings" mark (e.g. a fitness-tracker activity-ring icon) — checked by
 * rendering side by side before settling on this. Rendered as inline
 * SVG (not a static PNG) so it scales crisply from a 16px favicon up
 * to a PDF cover page. `variant="default"` draws its own dark rounded-
 * square badge (self-contained, safe on any background — light pages,
 * print, app-icon use); `variant="flat"` skips the badge and draws the
 * rings directly, for surfaces that are already dark (e.g. the
 * dashboard nav), where the badge would just be a dark square on a
 * dark square.
 */
const RINGS: { r: number; d: string; color: string }[] = [
  { r: 36, d: 'M65.21,82.63 A36,36 0 1 1 84.77,40.68', color: '#2FBFA6' },
  { r: 25, d: 'M64.34,70.48 A25,25 0 1 1 72.66,39.43', color: '#E2708A' },
  { r: 14, d: 'M59.90,59.90 A14,14 0 1 1 61.47,41.97', color: '#E3AC3D' },
];

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
      aria-label="Ownly"
    >
      {variant === 'default' && <rect width="100" height="100" rx="24" fill="#14152B" />}
      {RINGS.map((ring) => (
        <path key={ring.r} d={ring.d} stroke={ring.color} strokeWidth={8} strokeLinecap="round" fill="none" />
      ))}
    </svg>
  );
}
