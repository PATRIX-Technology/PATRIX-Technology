/**
 * The Hikayti mark: a smiling open book. Rendered as inline SVG (not the
 * static /icons/icon.svg) so it scales crisply at any size and can sit on
 * either a light surface (default, tinted background) or directly on a
 * brand-coloured surface (`variant="flat"`, e.g. inside the hero card).
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
  const bookFill = variant === 'flat' ? '#FFF8EC' : '#0e7a52';
  const faceFill = variant === 'flat' ? '#0e7a52' : '#FFF8EC';

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Hikayti"
    >
      <path
        d="M24 19 C19.2 15 11.5 15 7.5 17 L7.5 33 C11.5 31 19.2 31 24 35 C28.8 31 36.5 31 40.5 33 L40.5 17 C36.5 15 28.8 15 24 19 Z"
        fill={bookFill}
      />
      <path d="M24 19 L24 35" stroke="rgba(0,0,0,.18)" strokeWidth="1.2" fill="none" />
      <circle cx="16.5" cy="24" r="2" fill={faceFill} />
      <circle cx="31.5" cy="24" r="2" fill={faceFill} />
      <path
        d="M16.5 28 Q24 32.5 31.5 28"
        stroke={faceFill}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M33 5.5 L34.7 10.1 L39.3 11.8 L34.7 13.5 L33 18.1 L31.3 13.5 L26.7 11.8 L31.3 10.1 Z"
        fill="#f7a020"
      />
    </svg>
  );
}
