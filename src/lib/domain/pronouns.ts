import type { Locale } from '@/i18n/config';

export type Pronoun = 'she' | 'he' | 'they';

/**
 * English pronoun forms. Story text is written in past tense throughout
 * (see supabase/seed/templates.json) specifically so "they" never needs a
 * plural verb conjugation ("felt", not "feels"/"feel") — the one English
 * subject/verb agreement problem singular "they" has.
 */
const EN_FORMS: Record<Pronoun, { subject: string; possessive: string; object: string }> = {
  she: { subject: 'she', possessive: 'her', object: 'her' },
  he: { subject: 'he', possessive: 'his', object: 'him' },
  they: { subject: 'they', possessive: 'their', object: 'them' },
};

export function englishPronoun(pronoun: Pronoun, form: 'subject' | 'possessive' | 'object'): string {
  return EN_FORMS[pronoun][form];
}

/**
 * Arabic verb/phrase conjugations are gendered throughout MSA, unlike
 * English. Rather than a blunt word-for-word translation, each Arabic
 * template references a small fixed vocabulary of narrative verb-phrases
 * (see ArabicVerbKey) and this dictionary supplies the correct form for
 * she/he/they. "they" uses masculine-plural agreement, the conventional
 * MSA default for a mixed/unspecified-gender group — this default, like
 * all Arabic copy, is marked NEEDS NATIVE REVIEW in docs/DECISIONS.md and
 * story_theme_templates.native_review_status.
 */
export const ARABIC_VERB_KEYS = [
  'felt_happy',
  'felt_worried',
  'felt_proud',
  'felt_scared',
  'said',
  'decided',
  'smiled',
  'learned',
  'promised',
  'went',
  'washed_hands',
  'brushed_teeth',
  'tried',
  'ate',
  'wanted',
  'hugged',
  'subject_pronoun',
] as const;

export type ArabicVerbKey = (typeof ARABIC_VERB_KEYS)[number];

export const ARABIC_CONJUGATIONS: Record<ArabicVerbKey, Record<Pronoun, string>> = {
  subject_pronoun: { she: 'هي', he: 'هو', they: 'هم' },
  felt_happy: { she: 'شعرت بالسعادة', he: 'شعر بالسعادة', they: 'شعروا بالسعادة' },
  felt_worried: { she: 'شعرت بالقلق', he: 'شعر بالقلق', they: 'شعروا بالقلق' },
  felt_proud: { she: 'شعرت بالفخر', he: 'شعر بالفخر', they: 'شعروا بالفخر' },
  felt_scared: { she: 'شعرت بالخوف قليلًا', he: 'شعر بالخوف قليلًا', they: 'شعروا بالخوف قليلًا' },
  said: { she: 'قالت', he: 'قال', they: 'قالوا' },
  decided: { she: 'قررت', he: 'قرر', they: 'قرروا' },
  smiled: { she: 'ابتسمت', he: 'ابتسم', they: 'ابتسموا' },
  learned: { she: 'تعلّمت', he: 'تعلّم', they: 'تعلّموا' },
  promised: { she: 'وعدت', he: 'وعد', they: 'وعدوا' },
  went: { she: 'ذهبت', he: 'ذهب', they: 'ذهبوا' },
  washed_hands: { she: 'غسلت يديها', he: 'غسل يديه', they: 'غسلوا أيديهم' },
  brushed_teeth: { she: 'نظّفت أسنانها', he: 'نظّف أسنانه', they: 'نظّفوا أسنانهم' },
  tried: { she: 'حاولت', he: 'حاول', they: 'حاولوا' },
  ate: { she: 'أكلت', he: 'أكل', they: 'أكلوا' },
  wanted: { she: 'أرادت', he: 'أراد', they: 'أرادوا' },
  hugged: { she: 'عانقت', he: 'عانق', they: 'عانقوا' },
};

export function arabicVerb(key: ArabicVerbKey, pronoun: Pronoun): string {
  return ARABIC_CONJUGATIONS[key][pronoun];
}

export function isArabicVerbKey(key: string): key is ArabicVerbKey {
  return (ARABIC_VERB_KEYS as readonly string[]).includes(key);
}

export function pronounLabel(locale: Locale, pronoun: Pronoun): string {
  if (locale === 'ar') return ARABIC_CONJUGATIONS.subject_pronoun[pronoun];
  return EN_FORMS[pronoun].subject;
}
