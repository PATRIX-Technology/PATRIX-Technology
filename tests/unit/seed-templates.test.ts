import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StoryThemeTemplateSchema, renderTemplate } from '@/lib/domain/templates';
import type { Pronoun } from '@/lib/domain/pronouns';

interface SeedTemplateRow {
  theme_key: string;
  locale: 'en' | 'ar';
  category: string;
  title: string;
  synopsis: string;
  mascot_name: string;
  native_review_status: 'draft' | 'reviewed';
  pages: { order: number; text: string; image_prompt: string }[];
}

const raw = JSON.parse(
  readFileSync(join(__dirname, '../../supabase/seed/templates.json'), 'utf8'),
) as SeedTemplateRow[];

// The seed file omits `id`/`is_active` (added by the database on insert) —
// pad them in so the same schema used at runtime validates the fixture.
const templates = raw.map((row, index) => ({
  id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
  is_active: true,
  ...row,
}));

const PRONOUNS: Pronoun[] = ['she', 'he'];
const LEFTOVER_TOKEN = /\{[a-z_:]+\}/i;

// All 13 Arabic templates cleared a full review pass (grammar, gender
// agreement, cultural fit, mascot-name consistency — see
// docs/DECISIONS.md "Arabic native review pass") and are marked
// `reviewed`. Nothing is pending for Arabic right now; keep this set
// in sync (add a theme_key back here) the next time new Arabic pages
// are authored and need review before `assertTemplateUsable` allows
// them through — see `src/lib/domain/templates.ts`.
const PENDING_NATIVE_REVIEW_THEMES = new Set<string>([]);

describe('seed template fixtures (supabase/seed/templates.json)', () => {
  it('has exactly one English + one Arabic row per theme', () => {
    const byTheme = new Map<string, Set<string>>();
    for (const row of templates) {
      const locales = byTheme.get(row.theme_key) ?? new Set();
      locales.add(row.locale);
      byTheme.set(row.theme_key, locales);
    }
    for (const [themeKey, locales] of byTheme) {
      expect(locales, `${themeKey} should have both locales`).toEqual(new Set(['en', 'ar']));
    }
  });

  it('every row is valid against StoryThemeTemplateSchema', () => {
    for (const row of templates) {
      const result = StoryThemeTemplateSchema.safeParse(row);
      if (!result.success) {
        throw new Error(
          `${row.theme_key} (${row.locale}) failed validation: ${JSON.stringify(result.error.issues)}`,
        );
      }
    }
  });

  it('every Arabic row, except themes still pending native review, is marked reviewed', () => {
    // assertTemplateUsable (src/lib/domain/templates.ts) only gates
    // locale === 'ar' on native_review_status — English has no such
    // gate, so English rows are intentionally not asserted here; their
    // native_review_status field is inert.
    for (const row of templates) {
      if (row.locale !== 'ar') continue;
      if (PENDING_NATIVE_REVIEW_THEMES.has(row.theme_key)) {
        expect(row.native_review_status, row.theme_key).toBe('draft');
        continue;
      }
      expect(row.native_review_status, row.theme_key).toBe('reviewed');
    }
  });

  it('renders every English template for every pronoun with no leftover tokens', () => {
    for (const row of templates) {
      const parsed = StoryThemeTemplateSchema.parse(row);
      if (parsed.locale !== 'en') continue;

      for (const pronoun of PRONOUNS) {
        const pages = renderTemplate(parsed, {
          childName: 'Maya',
          pronoun,
          organisation: 'Little Explorers Nursery',
        });
        for (const page of pages) {
          expect(page.text, `${parsed.theme_key}/${pronoun} page ${page.order}`).not.toMatch(
            LEFTOVER_TOKEN,
          );
          expect(page.image_prompt, `${parsed.theme_key}/${pronoun} prompt ${page.order}`).not.toMatch(
            LEFTOVER_TOKEN,
          );
        }
      }
    }
  });

  it('renders every Arabic template for every pronoun with no leftover tokens (bypassing the draft gate for this structural check)', () => {
    for (const row of templates) {
      const parsed = StoryThemeTemplateSchema.parse({ ...row, native_review_status: 'reviewed' });
      if (parsed.locale !== 'ar') continue;

      for (const pronoun of PRONOUNS) {
        const pages = renderTemplate(parsed, {
          childName: 'مايا',
          pronoun,
          organisation: 'حضانة المستكشفين الصغار',
        });
        for (const page of pages) {
          expect(page.text, `${parsed.theme_key}/${pronoun} page ${page.order}`).not.toMatch(
            LEFTOVER_TOKEN,
          );
          expect(page.image_prompt, `${parsed.theme_key}/${pronoun} prompt ${page.order}`).not.toMatch(
            LEFTOVER_TOKEN,
          );
        }
      }
    }
  });

  it('the native-review gate still blocks any Arabic template actually marked draft', () => {
    // The seed data itself is reviewed now (see above), so this
    // synthesizes a draft row to prove the gate logic in
    // renderTemplate/assertTemplateUsable still works, independent of
    // the current seed content.
    for (const row of templates) {
      if (row.locale !== 'ar') continue;
      const parsed = StoryThemeTemplateSchema.parse({ ...row, native_review_status: 'draft' });
      expect(() =>
        renderTemplate(parsed, { childName: 'مايا', pronoun: 'she', organisation: 'X' }),
      ).toThrow(/native review/);
    }
  });
});
