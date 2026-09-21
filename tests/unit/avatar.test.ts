import { describe, expect, it } from 'vitest';
import { AvatarConfigSchema, DEFAULT_AVATAR_CONFIG, parseAvatarConfig } from '@/lib/domain/avatar';

describe('AvatarConfigSchema', () => {
  it('accepts a valid config', () => {
    const result = AvatarConfigSchema.safeParse({
      hair: 'curly_black',
      skinTone: 'medium',
      outfitColor: '#20949c',
      accessory: 'glasses',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid hex colour', () => {
    const result = AvatarConfigSchema.safeParse({
      ...DEFAULT_AVATAR_CONFIG,
      outfitColor: 'blue',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown hair option (no photo-derived free text allowed)', () => {
    const result = AvatarConfigSchema.safeParse({ ...DEFAULT_AVATAR_CONFIG, hair: 'photo-upload' });
    expect(result.success).toBe(false);
  });
});

describe('parseAvatarConfig', () => {
  it('falls back to the default config for garbage input', () => {
    expect(parseAvatarConfig({ nonsense: true })).toEqual(DEFAULT_AVATAR_CONFIG);
    expect(parseAvatarConfig(null)).toEqual(DEFAULT_AVATAR_CONFIG);
    expect(parseAvatarConfig('a photo url')).toEqual(DEFAULT_AVATAR_CONFIG);
  });

  it('passes through a valid config unchanged', () => {
    const valid = { hair: 'braids', skinTone: 'dark', outfitColor: '#ef4c2a', accessory: 'cap' } as const;
    expect(parseAvatarConfig(valid)).toEqual(valid);
  });
});
