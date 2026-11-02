import { describe, expect, it } from 'vitest';
import {
  NATIONALITY_OPTIONS,
  getFamilyDressDescription,
  isNationality,
  normalizeNationality,
} from '@/lib/domain/nationality';

describe('normalizeNationality', () => {
  it('matches exact enum values case-insensitively', () => {
    expect(normalizeNationality('emirati')).toBe('emirati');
    expect(normalizeNationality('EMIRATI')).toBe('emirati');
  });

  it('accepts common country-name aliases', () => {
    expect(normalizeNationality('UAE')).toBe('emirati');
    expect(normalizeNationality('USA')).toBe('american');
    expect(normalizeNationality('UK')).toBe('british');
    expect(normalizeNationality('Philippines')).toBe('filipino');
    expect(normalizeNationality('South Africa')).toBe('south_african');
  });

  it('returns null for blank or unrecognized input', () => {
    expect(normalizeNationality('')).toBeNull();
    expect(normalizeNationality('   ')).toBeNull();
    expect(normalizeNationality('Atlantis')).toBeNull();
  });

  it('accepts the "other" catch-all', () => {
    expect(normalizeNationality('other')).toBe('other');
  });
});

describe('isNationality', () => {
  it('accepts every value in NATIONALITY_OPTIONS', () => {
    for (const option of NATIONALITY_OPTIONS) {
      expect(isNationality(option.value)).toBe(true);
    }
  });

  it('rejects anything not in the list', () => {
    expect(isNationality('martian')).toBe(false);
    expect(isNationality(42)).toBe(false);
  });
});

describe('getFamilyDressDescription', () => {
  it('returns Emirati dress for emirati, in both locales', () => {
    expect(getFamilyDressDescription('emirati', 'en')).toBe('traditional Emirati dress');
    expect(getFamilyDressDescription('emirati', 'ar')).toBe('اللباس التقليدي الإماراتي');
  });

  it('returns a regional (not country-specific) description for other Gulf nationalities', () => {
    for (const nationality of ['saudi', 'kuwaiti', 'qatari', 'bahraini', 'omani'] as const) {
      expect(getFamilyDressDescription(nationality, 'en')).toBe('traditional Gulf dress');
      expect(getFamilyDressDescription(nationality, 'ar')).toBe('اللباس الخليجي التقليدي');
    }
  });

  it('returns the neutral default for every non-Gulf nationality, including "other"', () => {
    for (const nationality of ['indian', 'british', 'american', 'filipino', 'other'] as const) {
      expect(getFamilyDressDescription(nationality, 'en')).toBe('simple, modest, modern everyday clothing');
      expect(getFamilyDressDescription(nationality, 'ar')).toBe('ملابس عصرية بسيطة ومحتشمة');
    }
  });
});
