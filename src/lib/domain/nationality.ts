import type { Nationality } from '@/types/database';

/** Order shown in the dropdown — Gulf nationalities first (matches the
 * platform's primary UAE nursery audience), then broader MENA, then
 * South/Southeast Asia and Western expat nationalities common on a UAE
 * nursery roster, 'other' always last as the explicit catch-all. */
export const NATIONALITY_OPTIONS: { value: Nationality; labelEn: string; labelAr: string }[] = [
  { value: 'emirati', labelEn: 'Emirati', labelAr: 'إماراتي' },
  { value: 'saudi', labelEn: 'Saudi', labelAr: 'سعودي' },
  { value: 'kuwaiti', labelEn: 'Kuwaiti', labelAr: 'كويتي' },
  { value: 'qatari', labelEn: 'Qatari', labelAr: 'قطري' },
  { value: 'bahraini', labelEn: 'Bahraini', labelAr: 'بحريني' },
  { value: 'omani', labelEn: 'Omani', labelAr: 'عماني' },
  { value: 'egyptian', labelEn: 'Egyptian', labelAr: 'مصري' },
  { value: 'jordanian', labelEn: 'Jordanian', labelAr: 'أردني' },
  { value: 'lebanese', labelEn: 'Lebanese', labelAr: 'لبناني' },
  { value: 'syrian', labelEn: 'Syrian', labelAr: 'سوري' },
  { value: 'palestinian', labelEn: 'Palestinian', labelAr: 'فلسطيني' },
  { value: 'sudanese', labelEn: 'Sudanese', labelAr: 'سوداني' },
  { value: 'yemeni', labelEn: 'Yemeni', labelAr: 'يمني' },
  { value: 'indian', labelEn: 'Indian', labelAr: 'هندي' },
  { value: 'pakistani', labelEn: 'Pakistani', labelAr: 'باكستاني' },
  { value: 'bangladeshi', labelEn: 'Bangladeshi', labelAr: 'بنغلاديشي' },
  { value: 'filipino', labelEn: 'Filipino', labelAr: 'فلبيني' },
  { value: 'british', labelEn: 'British', labelAr: 'بريطاني' },
  { value: 'american', labelEn: 'American', labelAr: 'أمريكي' },
  { value: 'canadian', labelEn: 'Canadian', labelAr: 'كندي' },
  { value: 'french', labelEn: 'French', labelAr: 'فرنسي' },
  { value: 'german', labelEn: 'German', labelAr: 'ألماني' },
  { value: 'south_african', labelEn: 'South African', labelAr: 'جنوب أفريقي' },
  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

const NATIONALITY_VALUES = new Set(NATIONALITY_OPTIONS.map((o) => o.value));

export function isNationality(value: unknown): value is Nationality {
  return typeof value === 'string' && NATIONALITY_VALUES.has(value as Nationality);
}

/** Loose CSV-cell matching -- same convenience-alias approach as
 * normalizeLanguage/normalizePronoun in children.ts, not a strict ISO
 * code lookup, since a nursery's spreadsheet is never going to be
 * pixel-perfect here. Returns null for anything unrecognized (a row
 * error, like pronoun -- nationality is mandatory, so there's no
 * sensible silent default to fall back to). */
const CSV_ALIASES: Record<string, Nationality> = {
  emirati: 'emirati', uae: 'emirati', 'u.a.e': 'emirati', emirates: 'emirati',
  saudi: 'saudi', ksa: 'saudi', 'saudi arabia': 'saudi',
  kuwaiti: 'kuwaiti', kuwait: 'kuwaiti',
  qatari: 'qatari', qatar: 'qatari',
  bahraini: 'bahraini', bahrain: 'bahraini',
  omani: 'omani', oman: 'omani',
  egyptian: 'egyptian', egypt: 'egyptian',
  jordanian: 'jordanian', jordan: 'jordanian',
  lebanese: 'lebanese', lebanon: 'lebanese',
  syrian: 'syrian', syria: 'syrian',
  palestinian: 'palestinian', palestine: 'palestinian',
  sudanese: 'sudanese', sudan: 'sudanese',
  yemeni: 'yemeni', yemen: 'yemeni',
  indian: 'indian', india: 'indian',
  pakistani: 'pakistani', pakistan: 'pakistani',
  bangladeshi: 'bangladeshi', bangladesh: 'bangladeshi',
  filipino: 'filipino', filipina: 'filipino', philippines: 'filipino',
  british: 'british', uk: 'british', 'united kingdom': 'british', england: 'british',
  american: 'american', usa: 'american', us: 'american', 'united states': 'american',
  canadian: 'canadian', canada: 'canadian',
  french: 'french', france: 'french',
  german: 'german', germany: 'german',
  'south african': 'south_african', south_african: 'south_african', 'south africa': 'south_african',
  other: 'other',
};

export function normalizeNationality(value: string): Nationality | null {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;
  return CSV_ALIASES[v] ?? null;
}

const GULF_NATIONALITIES = new Set<Nationality>(['saudi', 'kuwaiti', 'qatari', 'bahraini', 'omani']);

/**
 * Resolves the {family_dress} template token (see renderTokens in
 * templates.ts) -- the one place nationality actually changes what gets
 * illustrated. Deliberately three tiers, not one description per
 * nationality: Emirati keeps the platform's original, most common
 * depiction; other Gulf nationalities get a respectful regional (not
 * country-specific) description rather than guessing at a dress neither
 * accurate nor theirs; every other nationality gets the same neutral,
 * modest, modern-clothing default the illustration prompt already uses
 * everywhere else in the app (see BRAND_STYLE_PROMPT in
 * src/lib/providers/image/prompts.ts) -- this is what actually fixes the
 * "hijab on a European child" problem, without inventing a "traditional
 * dress" for 20+ countries that may not have one clearly-defined
 * modern-day equivalent. See docs/DECISIONS.md "Nationality drives
 * culturally-appropriate illustration, not separate templates".
 */
export function getFamilyDressDescription(nationality: Nationality, locale: 'en' | 'ar'): string {
  if (nationality === 'emirati') {
    return locale === 'ar' ? 'اللباس التقليدي الإماراتي' : 'traditional Emirati dress';
  }
  if (GULF_NATIONALITIES.has(nationality)) {
    return locale === 'ar' ? 'اللباس الخليجي التقليدي' : 'traditional Gulf dress';
  }
  return locale === 'ar' ? 'ملابس عصرية بسيطة ومحتشمة' : 'simple, modest, modern everyday clothing';
}
