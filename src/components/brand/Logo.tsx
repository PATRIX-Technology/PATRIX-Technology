/**
 * The Khayali mark: a sparkle rising from an open storybook. Rendered as
 * inline SVG (not the static /icons/icon.svg) so it scales crisply at any
 * size. `variant="default"` draws its own dark rounded-square badge (for
 * light surfaces, or standalone use as an app-icon-style mark);
 * `variant="flat"` skips the badge and draws the mark directly, for
 * surfaces that are already dark (e.g. the dashboard nav).
 */
export function Logo({
  size = 32,
  variant = 'default',
  className = '',
}: {
  size?: number;
  variant?: 'default' | 'flat';
  className?: string;
}) {
  const bookFill = variant === 'flat' ? '#F4F1E8' : '#2FBFA6';
  const spineStroke = variant === 'flat' ? 'rgba(20,21,43,0.3)' : '#123A34';

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Khayali"
    >
      {variant === 'default' && <rect width="100" height="100" rx="24" fill="#14152B" />}
      <path
        d="M50 48 C42 40 24 40 15 44 L15 72 C24 68 42 68 50 76 C58 68 76 68 85 72 L85 44 C76 40 58 40 50 48 Z"
        fill={bookFill}
      />
      <path d="M50 48 L50 76" stroke={spineStroke} strokeWidth="1.6" fill="none" opacity="0.6" />
      <path
        d="M50 8 C52 20 55 25 68 27 C55 29 52 34 50 46 C48 34 45 29 32 27 C45 25 48 20 50 8 Z"
        fill="#E3AC3D"
      />
      <circle cx="70" cy="14" r="2.6" fill="#E3AC3D" />
    </svg>
  );
}
