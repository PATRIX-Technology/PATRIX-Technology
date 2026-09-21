import { z } from 'zod';

/**
 * The avatar system is deliberately NOT photo-based: every child is
 * represented by a small set of structured attributes that a renderer
 * (SVG today, illustrated-style images later) turns into a consistent
 * character across every page of every story. See docs/DECISIONS.md
 * "No photo personalisation at launch".
 */
export const HAIR_OPTIONS = [
  'bald',
  'short_black',
  'short_brown',
  'curly_black',
  'curly_brown',
  'straight_black',
  'straight_brown',
  'braids',
  'hijab',
] as const;

export const SKIN_TONE_OPTIONS = ['light', 'medium', 'tan', 'dark'] as const;

export const ACCESSORY_OPTIONS = ['none', 'glasses', 'cap', 'bow', 'headband'] as const;

export const OUTFIT_COLOR_OPTIONS = [
  '#20949c', // lagoon
  '#e5850c', // saffron
  '#ef4c2a', // coral
  '#6f5b42', // ink
  '#8a7454',
] as const;

export const AvatarConfigSchema = z.object({
  hair: z.enum(HAIR_OPTIONS),
  skinTone: z.enum(SKIN_TONE_OPTIONS),
  outfitColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour'),
  accessory: z.enum(ACCESSORY_OPTIONS),
});
export type AvatarConfig = z.infer<typeof AvatarConfigSchema>;

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  hair: 'curly_black',
  skinTone: 'medium',
  outfitColor: '#20949c',
  accessory: 'none',
};

export function parseAvatarConfig(value: unknown): AvatarConfig {
  const result = AvatarConfigSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_AVATAR_CONFIG;
}
