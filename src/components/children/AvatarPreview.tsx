import type { AvatarConfig } from '@/lib/domain/avatar';

const SKIN_COLORS: Record<AvatarConfig['skinTone'], string> = {
  light: '#F5D5B0',
  medium: '#D9A066',
  tan: '#B97A4B',
  dark: '#7A4B2E',
};

const HAIR_COLORS: Record<string, string> = {
  bald: 'transparent',
  short_black: '#241A12',
  short_brown: '#5A3A22',
  curly_black: '#241A12',
  curly_brown: '#5A3A22',
  straight_black: '#241A12',
  straight_brown: '#5A3A22',
  braids: '#241A12',
  hijab: '#2FBFA6',
};

function Hair({ hair, color }: { hair: AvatarConfig['hair']; color: string }) {
  switch (hair) {
    case 'bald':
      return null;
    case 'curly_black':
    case 'curly_brown':
      return (
        <path
          d="M50 92 C48 46 68 28 100 28 C132 28 152 46 150 92 C150 70 134 52 100 52 C66 52 50 70 50 92 Z"
          fill={color}
        />
      );
    case 'short_black':
    case 'short_brown':
      return (
        <path
          d="M52 88 C52 50 70 34 100 34 C130 34 148 50 148 88 L148 66 C148 54 132 44 100 44 C68 44 52 54 52 66 Z"
          fill={color}
        />
      );
    case 'straight_black':
    case 'straight_brown':
      return (
        <>
          <path
            d="M50 86 C50 44 70 28 100 28 C130 28 150 44 150 86 L150 108 C144 96 140 70 140 58 C140 46 122 38 100 38 C78 38 60 46 60 58 C60 70 56 96 50 108 Z"
            fill={color}
          />
        </>
      );
    case 'braids':
      return (
        <>
          <path
            d="M54 84 C54 46 72 30 100 30 C128 30 146 46 146 84 C146 66 130 50 100 50 C70 50 54 66 54 84 Z"
            fill={color}
          />
          <path d="M52 78 C46 96 46 116 54 130 C58 122 58 106 58 90 Z" fill={color} />
          <path d="M148 78 C154 96 154 116 146 130 C142 122 142 106 142 90 Z" fill={color} />
        </>
      );
    case 'hijab':
      return (
        <path
          d="M32 118 C28 70 56 30 100 30 C144 30 172 70 168 118 C158 100 150 90 150 78 C150 56 128 42 100 42 C72 42 50 56 50 78 C50 90 42 100 32 118 Z"
          fill={color}
        />
      );
    default:
      return null;
  }
}

/**
 * Structured-attribute character rendering — no photos, ever, see
 * docs/DECISIONS.md "No photo personalisation at launch". `animated`
 * turns on an idle blink/sway/sparkle loop for single, prominent
 * placements (the picker, a child's own page); list/table thumbnails
 * should leave it off so a page of rows doesn't turn into a wall of
 * motion. Motion is skipped automatically under prefers-reduced-motion
 * (see the global override in src/styles/globals.css).
 */
export function AvatarPreview({
  config,
  className = '',
  animated = false,
}: {
  config: AvatarConfig;
  className?: string;
  animated?: boolean;
}) {
  const hairColor = HAIR_COLORS[config.hair] ?? '#241A12';
  const skin = SKIN_COLORS[config.skinTone];

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Character preview">
      <circle cx="100" cy="100" r="96" fill="#FBF2E1" />
      <g style={animated ? { animation: 'avatar-bob 3.2s ease-in-out infinite' } : undefined}>
        <rect x="60" y="130" width="80" height="60" rx="20" fill={config.outfitColor} />
        <circle cx="100" cy="95" r="48" fill={skin} />
        <Hair hair={config.hair} color={hairColor} />

        <ellipse cx="79" cy="112" rx="7" ry="4.5" fill="#E2708A" opacity="0.4" />
        <ellipse cx="121" cy="112" rx="7" ry="4.5" fill="#E2708A" opacity="0.4" />

        {/* Open eyes: iris + tiny highlight for a lively, animated-show look. */}
        <g style={animated ? { animation: 'avatar-blink 4.6s ease-in-out infinite' } : undefined}>
          <circle cx="82" cy="98" r="5.5" fill="#241A12" />
          <circle cx="118" cy="98" r="5.5" fill="#241A12" />
          <circle cx="84" cy="96" r="1.6" fill="#FBF2E1" />
          <circle cx="120" cy="96" r="1.6" fill="#FBF2E1" />
        </g>
        {/* Closed eyes: crossfades in for the blink. */}
        <g
          opacity="0"
          style={animated ? { animation: 'avatar-blink-lids 4.6s ease-in-out infinite' } : undefined}
        >
          <path d="M76 98 Q82 102 88 98" stroke="#241A12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M112 98 Q118 102 124 98" stroke="#241A12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </g>

        <path d="M83 118 Q100 132 117 118" stroke="#241A12" strokeWidth="4" fill="none" strokeLinecap="round" />

        {config.accessory === 'glasses' && (
          <g stroke="#241A12" strokeWidth="3" fill="none">
            <circle cx="82" cy="98" r="14" />
            <circle cx="118" cy="98" r="14" />
            <path d="M96 98 H104" />
          </g>
        )}
        {config.accessory === 'bow' && <path d="M92 62 L108 62 L100 74 Z" fill="#E2708A" />}
        {config.accessory === 'cap' && (
          <path d="M55 78 C55 50 145 50 145 78 L145 88 L55 88 Z" fill={config.outfitColor} />
        )}
        {config.accessory === 'headband' && (
          <rect x="52" y="70" width="96" height="10" rx="5" fill={config.outfitColor} />
        )}
      </g>
      {animated && (
        <path
          d="M158 34 C159 42 161 45 169 47 C161 49 159 52 158 60 C157 52 155 49 147 47 C155 45 157 42 158 34 Z"
          fill="#E3AC3D"
          style={{ animation: 'sparkle-twinkle 2.6s ease-in-out infinite', transformOrigin: '158px 47px' }}
        />
      )}
    </svg>
  );
}
