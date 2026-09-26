import { useId } from 'react';
import type { AvatarConfig } from '@/lib/domain/avatar';

const SKIN_COLORS: Record<AvatarConfig['skinTone'], { base: string; light: string; shadow: string }> = {
  light: { base: '#F5D5B0', light: '#FDEED9', shadow: '#DDAE79' },
  medium: { base: '#D9A066', light: '#EFC48D', shadow: '#B27D45' },
  tan: { base: '#B97A4B', light: '#D69D6C', shadow: '#8C5A31' },
  dark: { base: '#7A4B2E', light: '#9C6842', shadow: '#4F2E1A' },
};

const HAIR_COLORS: Record<string, { base: string; light: string }> = {
  bald: { base: 'transparent', light: 'transparent' },
  short_black: { base: '#241A12', light: '#463526' },
  short_brown: { base: '#5A3A22', light: '#8A5C36' },
  curly_black: { base: '#241A12', light: '#463526' },
  curly_brown: { base: '#5A3A22', light: '#8A5C36' },
  straight_black: { base: '#241A12', light: '#463526' },
  straight_brown: { base: '#5A3A22', light: '#8A5C36' },
  braids: { base: '#241A12', light: '#463526' },
  hijab: { base: '#2FBFA6', light: '#6CDBC6' },
};

function Hair({ hair, fill }: { hair: AvatarConfig['hair']; fill: string }) {
  switch (hair) {
    case 'bald':
      return null;
    case 'curly_black':
    case 'curly_brown':
      return (
        <path
          d="M50 92 C48 46 68 28 100 28 C132 28 152 46 150 92 C150 70 134 52 100 52 C66 52 50 70 50 92 Z"
          fill={fill}
        />
      );
    case 'short_black':
    case 'short_brown':
      return (
        <path
          d="M52 88 C52 50 70 34 100 34 C130 34 148 50 148 88 L148 66 C148 54 132 44 100 44 C68 44 52 54 52 66 Z"
          fill={fill}
        />
      );
    case 'straight_black':
    case 'straight_brown':
      return (
        <path
          d="M50 86 C50 44 70 28 100 28 C130 28 150 44 150 86 L150 108 C144 96 140 70 140 58 C140 46 122 38 100 38 C78 38 60 46 60 58 C60 70 56 96 50 108 Z"
          fill={fill}
        />
      );
    case 'braids':
      return (
        <>
          <path
            d="M54 84 C54 46 72 30 100 30 C128 30 146 46 146 84 C146 66 130 50 100 50 C70 50 54 66 54 84 Z"
            fill={fill}
          />
          <path d="M52 78 C46 96 46 116 54 130 C58 122 58 106 58 90 Z" fill={fill} />
          <path d="M148 78 C154 96 154 116 146 130 C142 122 142 106 142 90 Z" fill={fill} />
        </>
      );
    case 'hijab':
      return (
        <path
          d="M32 118 C28 70 56 30 100 30 C144 30 172 70 168 118 C158 100 150 90 150 78 C150 56 128 42 100 42 C72 42 50 56 50 78 C50 90 42 100 32 118 Z"
          fill={fill}
        />
      );
    default:
      return null;
  }
}

/** Small skin-toned ears, drawn behind the face circle so only the part
 * outside its radius shows — a thin visible sliver, like a chibi
 * character, rather than a jarring separate shape. Hidden entirely under
 * a hijab or cap since those accessories are drawn afterwards and cover
 * the same area. */
function Ears({ skin, shadowFill }: { skin: string; shadowFill: string }) {
  return (
    <>
      <ellipse cx="47" cy="99" rx="9" ry="13" fill={skin} />
      <ellipse cx="48" cy="100" rx="4" ry="7" fill={shadowFill} opacity="0.5" />
      <ellipse cx="153" cy="99" rx="9" ry="13" fill={skin} />
      <ellipse cx="152" cy="100" rx="4" ry="7" fill={shadowFill} opacity="0.5" />
    </>
  );
}

/**
 * Structured-attribute character rendering — no photos, ever, see
 * docs/DECISIONS.md "No photo personalisation at launch". Uses soft
 * radial/linear gradients (skin, hair, outfit) plus ears, brows, a nose
 * and an open, laughing mouth for a warmer, more "toy-like" cartoon
 * finish — see docs/DECISIONS.md "Avatar visual redesign". Gradient ids
 * are scoped with useId() so rendering many instances at once (a table
 * of children, or the picker's live option previews) never lets one
 * avatar's gradient leak into another's via a duplicate SVG id.
 *
 * `animated` turns on an idle blink/sway/sparkle loop for single,
 * prominent placements (the picker, a child's own page); list/table
 * thumbnails should leave it off so a page of rows doesn't turn into a
 * wall of motion. Motion is skipped automatically under
 * prefers-reduced-motion (see the global override in
 * src/styles/globals.css).
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
  const uid = useId();
  const skinGradId = `${uid}-skin`;
  const hairGradId = `${uid}-hair`;
  const shirtGradId = `${uid}-shirt`;

  const hairColor = HAIR_COLORS[config.hair] ?? HAIR_COLORS.short_black!;
  const skin = SKIN_COLORS[config.skinTone];

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Character preview">
      <defs>
        <radialGradient id={skinGradId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={skin.light} />
          <stop offset="60%" stopColor={skin.base} />
          <stop offset="100%" stopColor={skin.shadow} />
        </radialGradient>
        <linearGradient id={hairGradId} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor={hairColor.light} />
          <stop offset="100%" stopColor={hairColor.base} />
        </linearGradient>
        <linearGradient id={shirtGradId} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="45%" stopColor={config.outfitColor} stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <circle cx="100" cy="100" r="96" fill="#FBF2E1" />
      <g style={animated ? { animation: 'avatar-bob 3.2s ease-in-out infinite' } : undefined}>
        {/* Body/shoulders: solid colour first, then a diagonal sheen overlay on top. */}
        <path
          d="M52 190 C52 156 68 138 100 138 C132 138 148 156 148 190 Z"
          fill={config.outfitColor}
        />
        <path
          d="M76 140 C84 137 92 136 100 136 C108 136 116 137 124 140 L124 150 L118 156 L100 150 L82 156 L76 150 Z"
          fill="#FFFFFF"
          opacity="0.9"
        />
        <path d="M52 190 C52 156 68 138 100 138 C132 138 148 156 148 190 Z" fill={`url(#${shirtGradId})`} />

        <Ears skin={skin.base} shadowFill={skin.shadow} />
        <circle cx="100" cy="95" r="48" fill={`url(#${skinGradId})`} />

        {/* Nose: a soft, barely-there shadow bump rather than a hard line. */}
        <ellipse cx="100" cy="107" rx="3.4" ry="2.6" fill={skin.shadow} opacity="0.45" />

        <Hair hair={config.hair} fill={`url(#${hairGradId})`} />

        {/* Eyebrows */}
        <path d="M72 86 Q80 80 89 85" stroke={hairColor.base} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M111 85 Q120 80 128 86" stroke={hairColor.base} strokeWidth="3.2" fill="none" strokeLinecap="round" />

        <ellipse cx="78" cy="113" rx="7.5" ry="5" fill="#E2708A" opacity="0.45" />
        <ellipse cx="122" cy="113" rx="7.5" ry="5" fill="#E2708A" opacity="0.45" />

        {/* Open eyes: iris + two tiny highlights for a lively, sparkly look. */}
        <g style={animated ? { animation: 'avatar-blink 4.6s ease-in-out infinite' } : undefined}>
          <circle cx="81" cy="98" r="6.4" fill="#241A12" />
          <circle cx="119" cy="98" r="6.4" fill="#241A12" />
          <circle cx="83.5" cy="95.5" r="2" fill="#FBF2E1" />
          <circle cx="121.5" cy="95.5" r="2" fill="#FBF2E1" />
          <circle cx="79" cy="100.5" r="1" fill="#FBF2E1" opacity="0.8" />
          <circle cx="117" cy="100.5" r="1" fill="#FBF2E1" opacity="0.8" />
        </g>
        {/* Closed eyes: crossfades in for the blink. */}
        <g
          opacity="0"
          style={animated ? { animation: 'avatar-blink-lids 4.6s ease-in-out infinite' } : undefined}
        >
          <path d="M75 98 Q81 102 87 98" stroke="#241A12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M113 98 Q119 102 125 98" stroke="#241A12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </g>

        {/* Open, laughing mouth: dark inner shape with a bright tooth-line, warmer than a plain smile stroke. */}
        <path d="M80 117 Q100 140 120 117 Q112 130 100 130 Q88 130 80 117 Z" fill="#8A4A3E" />
        <path d="M84 119 Q100 128 116 119 Q108 123 100 123 Q92 123 84 119 Z" fill="#FFFFFF" />

        {config.accessory === 'glasses' && (
          <g stroke="#241A12" strokeWidth="3" fill="none">
            <circle cx="81" cy="98" r="15" />
            <circle cx="119" cy="98" r="15" />
            <path d="M96 98 H104" />
          </g>
        )}
        {config.accessory === 'bow' && (
          <g>
            <path
              d="M97 52 C90 44 76 43 70 51 C65 58 71 67 82 63 C88 61 94 57 97 52 Z"
              fill="#E2708A"
            />
            <path
              d="M103 52 C110 44 124 43 130 51 C135 58 129 67 118 63 C112 61 106 57 103 52 Z"
              fill="#E2708A"
            />
            <circle cx="100" cy="54" r="6.5" fill="#C85A73" />
          </g>
        )}
        {config.accessory === 'cap' && (
          <g>
            <path
              d="M48 84 C46 42 154 42 152 84 C152 91 145 91 143 84 C143 58 128 48 100 48 C72 48 57 58 57 84 C55 91 48 91 48 84 Z"
              fill={config.outfitColor}
            />
            <rect x="50" y="80" width="100" height="11" rx="5.5" fill="#000000" opacity="0.15" />
          </g>
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
