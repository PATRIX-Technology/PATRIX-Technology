import type { Locale } from '@/i18n/config';

/** Binary only — see docs/DECISIONS.md "Pronoun is binary only (no
 * 'they')". */
export type Pronoun = 'she' | 'he';

/** English pronoun forms. */
const EN_FORMS: Record<Pronoun, { subject: string; possessive: string; object: string }> = {
  she: { subject: 'she', possessive: 'her', object: 'her' },
  he: { subject: 'he', possessive: 'his', object: 'him' },
};

export function englishPronoun(pronoun: Pronoun, form: 'subject' | 'possessive' | 'object'): string {
  return EN_FORMS[pronoun][form];
}

/**
 * Arabic verb/phrase conjugations are gendered throughout MSA, unlike
 * English. Rather than a blunt word-for-word translation, each Arabic
 * template references a small fixed vocabulary of narrative verb-phrases
 * (see ArabicVerbKey) and this dictionary supplies the correct form for
 * she/he — see docs/DECISIONS.md "Pronoun is binary only (no 'they')" for
 * why a third, plural/neutral form isn't offered.
 */
export const ARABIC_VERB_KEYS = [
  'felt_happy',
  'felt_worried',
  'felt_proud',
  'felt_scared',
  'felt_grateful',
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
  'saved',
  'counted',
  'shared',
  'sang',
  'waved',
  'celebrated',
  'subject_pronoun',
  // Added to close a class of gender-agreement bugs where a template
  // hardcoded a masculine verb/phrase for the CHILD's own action instead
  // of using a token — see docs/DECISIONS.md "Arabic gender-agreement
  // audit of the story templates".
  'told',
  'fills',
  'looked',
  'did_not_find',
  'asked_for_more',
  'ignored_teeth',
  'warned_the_child',
  'saw',
  'never_stopped_brushing',
  'stood',
  'while_holding_bag',
  'did_not_want',
  'made_new_friends',
  'could_not',
  'feels_present',
  'was_not_sure',
  'knew',
  'learns_present',
  'older_sibling_copula',
  'older_sibling_noun',
  'showed_toy',
  'helped_choose',
  'accidentally_dropped',
  'thought_to_hide',
  'took_deep_breath',
  'imagined',
  'discovers_present',
  'emptied',
  'saved_it_up',
  'while_looking',
  'while_humming',
  'sat_down',
  'true_bubble_hero',
  'thought',
  'called_it_home',
  'heard',
  'went_together_dual',
  'clean_imperative',
  'opened_water',
  'put_soap',
  'to_eat_snack',
] as const;

export type ArabicVerbKey = (typeof ARABIC_VERB_KEYS)[number];

export const ARABIC_CONJUGATIONS: Record<ArabicVerbKey, Record<Pronoun, string>> = {
  subject_pronoun: { she: 'هي', he: 'هو' },
  felt_happy: { she: 'شعرت بالسعادة', he: 'شعر بالسعادة' },
  felt_worried: { she: 'شعرت بالقلق', he: 'شعر بالقلق' },
  felt_proud: { she: 'شعرت بالفخر', he: 'شعر بالفخر' },
  felt_scared: { she: 'شعرت بالخوف قليلا', he: 'شعر بالخوف قليلا' },
  felt_grateful: { she: 'شعرت بالامتنان', he: 'شعر بالامتنان' },
  said: { she: 'قالت', he: 'قال' },
  decided: { she: 'قررت', he: 'قرر' },
  smiled: { she: 'ابتسمت', he: 'ابتسم' },
  learned: { she: 'تعلمت', he: 'تعلم' },
  promised: { she: 'وعدت', he: 'وعد' },
  went: { she: 'ذهبت', he: 'ذهب' },
  washed_hands: { she: 'غسلت يديها', he: 'غسل يديه' },
  brushed_teeth: { she: 'نظفت أسنانها', he: 'نظف أسنانه' },
  tried: { she: 'حاولت', he: 'حاول' },
  ate: { she: 'أكلت', he: 'أكل' },
  wanted: { she: 'أرادت', he: 'أراد' },
  hugged: { she: 'عانقت', he: 'عانق' },
  saved: { she: 'ادخرت', he: 'ادخر' },
  counted: { she: 'عدت', he: 'عد' },
  shared: { she: 'شاركت', he: 'شارك' },
  sang: { she: 'غنت', he: 'غنى' },
  waved: { she: 'لوحت', he: 'لوح' },
  celebrated: { she: 'احتفلت', he: 'احتفل' },
  told: { she: 'أخبرت', he: 'أخبر' },
  fills: { she: 'تملأ', he: 'يملأ' },
  looked: { she: 'نظرت', he: 'نظر' },
  did_not_find: { she: 'لم تجد', he: 'لم يجد' },
  asked_for_more: { she: 'وطلبت', he: 'وطلب' },
  ignored_teeth: {
    she: 'أن تتجاهل تنظيف أسنانها',
    he: 'أن يتجاهل تنظيف أسنانه',
  },
  warned_the_child: { she: 'فحذرتها', he: 'فحذرته' },
  saw: { she: 'رأت', he: 'رأى' },
  never_stopped_brushing: {
    she: 'لم تتوقف عن تنظيف أسنانها',
    he: 'لم يتوقف عن تنظيف أسنانه',
  },
  stood: { she: 'وقفت', he: 'وقف' },
  while_holding_bag: {
    she: 'وهي تمسك حقيبتها',
    he: 'وهو يمسك حقيبته',
  },
  did_not_want: { she: 'ترغب', he: 'يرغب' },
  made_new_friends: { she: 'كونت', he: 'كون' },
  could_not: { she: 'تستطع', he: 'يستطع' },
  feels_present: { she: 'تشعر', he: 'يشعر' },
  was_not_sure: {
    she: 'لم تكن متأكدة',
    he: 'لم يكن متأكدا',
  },
  knew: { she: 'عرفت', he: 'عرف' },
  learns_present: { she: 'تتعلم', he: 'يتعلم' },
  older_sibling_copula: { she: 'تكون', he: 'يكون' },
  older_sibling_noun: {
    she: 'أختا كبيرة وحنونة',
    he: 'أخا كبيرا وحنونا',
  },
  showed_toy: { she: 'أرته', he: 'أراه' },
  helped_choose: { she: 'وحتى ساعدت', he: 'وحتى ساعد' },
  accidentally_dropped: { she: 'أسقطت', he: 'أسقط' },
  thought_to_hide: {
    she: 'وفكرت أن تخفي ما حدث وألا تخبر أحدا',
    he: 'وفكر أن يخفي ما حدث وألا يخبر أحدا',
  },
  took_deep_breath: { she: 'أخذت', he: 'أخذ' },
  imagined: { she: 'تخيلت', he: 'تخيل' },
  discovers_present: { she: 'تكتشف', he: 'يكتشف' },
  emptied: { she: 'أفرغت', he: 'أفرغ' },
  saved_it_up: { she: 'ادخرتها', he: 'ادخرها' },
  while_looking: { she: 'وهي تنظر', he: 'وهو ينظر' },
  while_humming: { she: 'وهي تدندن', he: 'وهو يدندن' },
  sat_down: { she: 'جلست', he: 'جلس' },
  true_bubble_hero: {
    she: 'بطلة فقاعات حقيقية',
    he: 'بطل فقاعات حقيقي',
  },
  thought: { she: 'فكرت', he: 'فكر' },
  called_it_home: { she: 'سمته', he: 'سماه' },
  heard: { she: 'سمعت', he: 'سمع' },
  went_together_dual: { she: 'ذهبتا', he: 'ذهبا' },
  clean_imperative: { she: 'نظفي', he: 'نظف' },
  opened_water: { she: 'فتحت', he: 'فتح' },
  put_soap: { she: 'ووضعت', he: 'ووضع' },
  to_eat_snack: { she: 'لتأكل', he: 'ليأكل' },
};

/**
 * Arabic possessive/object pronoun suffixes ("his"/"her" when fused onto
 * a noun, or "him"/"her" when fused onto a verb — the same two suffixes
 * cover both in MSA). Used via the {ps} token directly appended to a
 * word stem in template text (e.g. "عائلت{ps}"), unlike {v:...} keys
 * which supply a whole conjugated word.
 */
export const ARABIC_POSSESSIVE_SUFFIX: Record<Pronoun, string> = {
  she: 'ها',
  he: 'ه',
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
