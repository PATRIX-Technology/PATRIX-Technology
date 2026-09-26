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
  subject_pronoun: { she: 'هي', he: 'هو', they: 'هم' },
  felt_happy: { she: 'شعرت بالسعادة', he: 'شعر بالسعادة', they: 'شعروا بالسعادة' },
  felt_worried: { she: 'شعرت بالقلق', he: 'شعر بالقلق', they: 'شعروا بالقلق' },
  felt_proud: { she: 'شعرت بالفخر', he: 'شعر بالفخر', they: 'شعروا بالفخر' },
  felt_scared: { she: 'شعرت بالخوف قليلًا', he: 'شعر بالخوف قليلًا', they: 'شعروا بالخوف قليلًا' },
  felt_grateful: { she: 'شعرت بالامتنان', he: 'شعر بالامتنان', they: 'شعروا بالامتنان' },
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
  saved: { she: 'ادّخرت', he: 'ادّخر', they: 'ادّخروا' },
  counted: { she: 'عدّت', he: 'عدّ', they: 'عدّوا' },
  shared: { she: 'شاركت', he: 'شارك', they: 'شاركوا' },
  sang: { she: 'غنّت', he: 'غنّى', they: 'غنّوا' },
  waved: { she: 'لوّحت', he: 'لوّح', they: 'لوّحوا' },
  celebrated: { she: 'احتفلت', he: 'احتفل', they: 'احتفلوا' },
  told: { she: 'أخبرت', he: 'أخبر', they: 'أخبروا' },
  fills: { she: 'تملأ', he: 'يملأ', they: 'يملؤون' },
  looked: { she: 'نظرت', he: 'نظر', they: 'نظروا' },
  did_not_find: { she: 'لم تجد', he: 'لم يجد', they: 'لم يجدوا' },
  asked_for_more: { she: 'وطلبت', he: 'وطلب', they: 'وطلبوا' },
  ignored_teeth: {
    she: 'أن تتجاهل تنظيف أسنانها',
    he: 'أن يتجاهل تنظيف أسنانه',
    they: 'أن يتجاهلوا تنظيف أسنانهم',
  },
  warned_the_child: { she: 'فحذّرتها', he: 'فحذّرته', they: 'فحذّرتهم' },
  saw: { she: 'رأت', he: 'رأى', they: 'رأوا' },
  never_stopped_brushing: {
    she: 'لم تتوقف عن تنظيف أسنانها',
    he: 'لم يتوقف عن تنظيف أسنانه',
    they: 'لم يتوقفوا عن تنظيف أسنانهم',
  },
  stood: { she: 'وقفت', he: 'وقف', they: 'وقفوا' },
  while_holding_bag: {
    she: 'وهي تمسك حقيبتها',
    he: 'وهو يمسك حقيبته',
    they: 'وهم يمسكون حقيبتهم',
  },
  did_not_want: { she: 'ترغب', he: 'يرغب', they: 'يرغبوا' },
  made_new_friends: { she: 'كوّنت', he: 'كوّن', they: 'كوّنوا' },
  could_not: { she: 'تستطع', he: 'يستطع', they: 'يستطيعوا' },
  feels_present: { she: 'تشعر', he: 'يشعر', they: 'يشعرون' },
  was_not_sure: {
    she: 'لم تكن متأكدة',
    he: 'لم يكن متأكدًا',
    they: 'لم يكونوا متأكدين',
  },
  knew: { she: 'عرفت', he: 'عرف', they: 'عرفوا' },
  learns_present: { she: 'تتعلّم', he: 'يتعلّم', they: 'يتعلّمون' },
  older_sibling_copula: { she: 'تكون', he: 'يكون', they: 'يكونوا' },
  older_sibling_noun: {
    she: 'أختًا كبيرة وحنونة',
    he: 'أخًا كبيرًا وحنونًا',
    they: 'إخوةً كبارًا وحنونين',
  },
  showed_toy: { she: 'أرته', he: 'أراه', they: 'أروه' },
  helped_choose: { she: 'وحتى ساعدت', he: 'وحتى ساعد', they: 'وحتى ساعدوا' },
  accidentally_dropped: { she: 'أسقطت', he: 'أسقط', they: 'أسقطوا' },
  thought_to_hide: {
    she: 'وفكّرت أن تخفي ما حدث وألّا تخبر أحداً',
    he: 'وفكّر أن يخفي ما حدث وألّا يخبر أحداً',
    they: 'وفكّروا أن يخفوا ما حدث وألّا يخبروا أحداً',
  },
  took_deep_breath: { she: 'أخذت', he: 'أخذ', they: 'أخذوا' },
  imagined: { she: 'تخيلت', he: 'تخيل', they: 'تخيلوا' },
  discovers_present: { she: 'تكتشف', he: 'يكتشف', they: 'يكتشفون' },
  emptied: { she: 'أفرغت', he: 'أفرغ', they: 'أفرغوا' },
  saved_it_up: { she: 'ادّخرتها', he: 'ادّخرها', they: 'ادّخروها' },
  while_looking: { she: 'وهي تنظر', he: 'وهو ينظر', they: 'وهم ينظرون' },
  while_humming: { she: 'وهي تدندن', he: 'وهو يدندن', they: 'وهم يدندنون' },
  sat_down: { she: 'جلست', he: 'جلس', they: 'جلسوا' },
  true_bubble_hero: {
    she: 'بطلة فقاعات حقيقية',
    he: 'بطل فقاعات حقيقي',
    they: 'أبطال فقاعات حقيقيون',
  },
  thought: { she: 'فكّرت', he: 'فكّر', they: 'فكّروا' },
  called_it_home: { she: 'سمّته', he: 'سمّاه', they: 'سمّوه' },
  heard: { she: 'سمعت', he: 'سمع', they: 'سمعوا' },
  went_together_dual: { she: 'ذهبتا', he: 'ذهبا', they: 'ذهبا' },
  clean_imperative: { she: 'نظّفي', he: 'نظّف', they: 'نظّفوا' },
  opened_water: { she: 'فتحت', he: 'فتح', they: 'فتحوا' },
  put_soap: { she: 'ووضعت', he: 'ووضع', they: 'ووضعوا' },
  to_eat_snack: { she: 'لتأكل', he: 'ليأكل', they: 'ليأكلوا' },
};

/**
 * Arabic possessive/object pronoun suffixes ("his"/"her"/"their" when
 * fused onto a noun, or "him"/"her"/"them" when fused onto a verb — the
 * same three suffixes cover both in MSA). Used via the {ps} token
 * directly appended to a word stem in template text (e.g. "عائلت{ps}"),
 * unlike {v:...} keys which supply a whole conjugated word.
 */
export const ARABIC_POSSESSIVE_SUFFIX: Record<Pronoun, string> = {
  she: 'ها',
  he: 'ه',
  they: 'هم',
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
