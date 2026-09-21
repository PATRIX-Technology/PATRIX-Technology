import type { AvatarConfig } from '@/lib/domain/avatar';

const SKIN_COLORS: Record<AvatarConfig['skinTone'], string> = {
  light: '#F7D9B8',
  medium: '#D9A066',
  tan: '#B97A4B',
  dark: '#7A4B2E',
};

const HAIR_COLORS: Record<string, string> = {
  bald: 'transparent',
  short_black: '#2A211B',
  short_brown: '#5A3A22',
  curly_black: '#2A211B',
  curly_brown: '#5A3A22',
  straight_black: '#2A211B',
  straight_brown: '#5A3A22',
  braids: '#2A211B',
  hijab: '#20949C',
};

/** Deterministic SVG avatar rendering — no photos, ever. See docs/DECISIONS.md. */
export function AvatarPreview({ config, className = '' }: { config: AvatarConfig; className?: string }) {
  const hairColor = HAIR_COLORS[config.hair] ?? '#2A211B';

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Avatar preview">
      <circle cx="100" cy="100" r="96" fill="#FFF8EC" />
      <rect x="60" y="130" width="80" height="60" rx="20" fill={config.outfitColor} />
      <circle cx="100" cy="95" r="48" fill={SKIN_COLORS[config.skinTone]} />
      {config.hair !== 'bald' && (
        <path
          d="M52 90 C52 45 70 30 100 30 C130 30 148 45 148 90 C148 70 130 55 100 55 C70 55 52 70 52 90 Z"
          fill={hairColor}
        />
      )}
      <circle cx="82" cy="98" r="5" fill="#2A211B" />
      <circle cx="118" cy="98" r="5" fill="#2A211B" />
      <path d="M85 118 Q100 130 115 118" stroke="#2A211B" strokeWidth="4" fill="none" strokeLinecap="round" />
      {config.accessory === 'glasses' && (
        <g stroke="#2A211B" strokeWidth="3" fill="none">
          <circle cx="82" cy="98" r="14" />
          <circle cx="118" cy="98" r="14" />
          <path d="M96 98 H104" />
        </g>
      )}
      {config.accessory === 'bow' && <path d="M92 62 L108 62 L100 74 Z" fill="#EF4C2A" />}
      {config.accessory === 'cap' && (
        <path d="M55 78 C55 50 145 50 145 78 L145 88 L55 88 Z" fill={config.outfitColor} />
      )}
      {config.accessory === 'headband' && (
        <rect x="52" y="70" width="96" height="10" rx="5" fill={config.outfitColor} />
      )}
    </svg>
  );
}
