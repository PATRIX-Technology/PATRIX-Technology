/**
 * Shared visual building blocks for every theme/template picker that
 * groups templates into category cards with a popup per category --
 * the single-story picker (CreateStoryForm.tsx) and the nursery bulk
 * roster picker (ChildrenListWithBulkConsent.tsx) both use these, so a
 * new theme's icon/tint or a new category's label/accent/icon only needs
 * to be added once. See docs/DECISIONS.md "Category cards + popup
 * template picker".
 */

// Display order for known categories; anything else (a future category
// seeded without updating this list) is appended after, alphabetically,
// rather than dropped.
export const CATEGORY_ORDER = ['family', 'nurseries', 'gifts', 'educational', 'entertainment'];

/** Sorts a list of category keys the same way every picker does: known
 * categories in CATEGORY_ORDER, anything else appended alphabetically. */
export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Hard-coded bilingual pair per category, shown together regardless of the
// active UI language — see docs/DECISIONS.md "Bilingual template names in
// the story picker". Kept in sync by hand with messages/{en,ar}.json's
// `stories.categories` block (next-intl only ever surfaces one locale at a
// time, which is exactly what this can't use).
export const CATEGORY_LABELS: Record<string, { en: string; ar: string }> = {
  family: { en: 'Family', ar: 'العائلة' },
  nurseries: { en: 'Nurseries', ar: 'الحضانات' },
  gifts: { en: 'Gifts', ar: 'الهدايا' },
  educational: { en: 'Educational', ar: 'تعليمية' },
  entertainment: { en: 'Super Heroes (Entertainment)', ar: 'الأبطال الخارقون (ترفيه)' },
};

// One accent per category (background tint for the section header, border
// accent for its cards) so categories read as visually distinct blocks
// rather than one undifferentiated list.
export const CATEGORY_ACCENTS: Record<string, { header: string; cardBorder: string }> = {
  family: { header: 'bg-coral-900/30 text-coral-300', cardBorder: 'hover:border-coral-700' },
  nurseries: { header: 'bg-lagoon-900/40 text-lagoon-300', cardBorder: 'hover:border-lagoon-700' },
  gifts: { header: 'bg-saffron-900/30 text-saffron-300', cardBorder: 'hover:border-saffron-600' },
  educational: { header: 'bg-lagoon-900/40 text-lagoon-300', cardBorder: 'hover:border-lagoon-700' },
  entertainment: { header: 'bg-coral-900/30 text-coral-300', cardBorder: 'hover:border-coral-700' },
};
export const DEFAULT_ACCENT = { header: 'bg-ink-800 text-ink-300', cardBorder: 'hover:border-ink-600' };

// One icon per category, shown on the category's own clickable card box.
export const CATEGORY_ICONS: Record<string, JSX.Element> = {
  family: (
    <path
      d="M12 20s-7-4.2-9.3-8.4C.9 8.4 3 5 6.5 5c2 0 3.3 1 5.5 3.3C14.2 6 15.5 5 17.5 5 21 5 23.1 8.4 21.3 11.6 19 15.8 12 20 12 20Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  nurseries: (
    <path
      d="M12 4 2 9l10 5 10-5-10-5Zm-6 7.2V16c0 1.8 2.5 3 6 3s6-1.2 6-3v-4.8"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  gifts: (
    <path
      d="M4 9h16v11H4V9Zm-1 0h18v4H3V9Zm9-5c-2 0-3 1.3-3 2.5S10 9 12 9s3-1.3 3-2.5S14 4 12 4Zm0 0c2 0 3 1.3 3 2.5S14 9 12 9m0-9c-2 0-3 1.3-3 2.5S10 9 12 9"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  educational: (
    <path
      d="M4 5.5c2.5-1.3 5.5-1.3 8 0 2.5-1.3 5.5-1.3 8 0v13c-2.5-1.3-5.5-1.3-8 0-2.5-1.3-5.5-1.3-8 0v-13Zm8 0v13"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  entertainment: (
    <path
      d="m12 2 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6L12 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    />
  ),
};
export const DEFAULT_CATEGORY_ICON = (
  <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
);

export const THEME_ICONS: Record<string, JSX.Element> = {
  healthy_eating: (
    <path
      d="M12 3c-3 2-6 2-8 1v9c2-1 5-1 8 1 3-2 6-2 8-1V4c-2 1-5 1-8-1Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  brushing_teeth: (
    <path
      d="M5 4h6a4 4 0 0 1 4 4v11a2 2 0 0 1-4 0v-6H9v6a2 2 0 0 1-4 0V4Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  first_day_school: (
    <path
      d="M12 3 3 8l9 5 9-5-9-5Zm-6 7.2V16c0 1.8 2.5 3 6 3s6-1.2 6-3v-5.8"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  new_sibling: (
    <path
      d="M12 20s-7-4.2-9.3-8.4C.9 8.4 3 5 6.5 5c2 0 3.3 1 5.5 3.3C14.2 6 15.5 5 17.5 5 21 5 23.1 8.4 21.3 11.6 19 15.8 12 20 12 20Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  honesty: (
    <path
      d="M12 3l7 3v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6l7-3Zm-3 8.5 2 2 4-4.5"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  hand_washing: (
    <path
      d="M12 2c2 3 5 6 5 10a5 5 0 0 1-10 0c0-4 3-7 5-10Z"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinejoin="round"
    />
  ),
  saving_money: (
    <path
      d="M4 12c0-3.3 3.1-6 7-6 2 0 3.8.7 5 1.8l2-.3.6 2-1.4 1c.3.8.4 1.6.3 2.4C17.1 16.4 13.9 19 10 19c-3.9 0-6-2.5-6-4v-3Zm3-2.2h.01"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  national_day_gratitude: (
    <path
      d="M12 2v14M12 2l4 3-4 3-4-3 4-3Zm-6 18h12"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  donut_maker: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" fill="none" />
      <circle cx="9" cy="8" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="9.5" r="0.9" fill="currentColor" />
      <circle cx="16" cy="15" r="0.9" fill="currentColor" />
      <circle cx="8" cy="16" r="0.9" fill="currentColor" />
    </>
  ),
  ramadan_reflection: (
    <>
      <path
        d="M15.5 4.5a8 8 0 1 0 4 11.3A6.5 6.5 0 0 1 15.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M18 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" fill="currentColor" />
    </>
  ),
  eid_celebration: (
    <>
      <path
        d="M8 3h8l1 3H7l1-3Zm-2 5h12l-1.3 11.5a1 1 0 0 1-1 .9H8.3a1 1 0 0 1-1-.9L6 8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M12 11v5M9.5 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  birthday_wishes: (
    <>
      <path
        d="M12 3a2.2 2.2 0 0 1 2.2 2.4c-.1 1.9-1.6 3.6-2.2 4.3-.6-.7-2.1-2.4-2.2-4.3A2.2 2.2 0 0 1 12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M12 9.7v11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 21c0-4 2-5 5-5s5 1 5 5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </>
  ),
  graduation_day: (
    <path
      d="M12 4 2 9l10 5 10-5-10-5Zm-6 7.5V16c0 1.8 2.7 3 6 3s6-1.2 6-3v-4.5M20 9v6"
      stroke="currentColor"
      strokeWidth="1.7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  being_kind: (
    <>
      <path
        d="M12 20s-7-4.2-9.3-8.4C.9 8.4 3 5 6.5 5c2 0 3.3 1 5.5 3.3C14.2 6 15.5 5 17.5 5 21 5 23.1 8.4 21.3 11.6 19 15.8 12 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 11.5 10 13l4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  keep_smiling: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" fill="none" />
      <path d="M8 13.5c1 1.3 2.4 2 4 2s3-.7 4-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9" cy="9.5" r="1" fill="currentColor" />
      <circle cx="15" cy="9.5" r="1" fill="currentColor" />
    </>
  ),
};

export const FALLBACK_ICON = (
  <path
    d="M4 6h16M4 12h16M4 18h10"
    stroke="currentColor"
    strokeWidth="1.7"
    fill="none"
    strokeLinecap="round"
  />
);

export const ICON_TINTS = ['bg-lagoon-900/50 text-lagoon-300', 'bg-saffron-900/40 text-saffron-300', 'bg-coral-900/40 text-coral-300'];
