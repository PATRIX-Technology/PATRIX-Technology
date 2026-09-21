import { z } from 'zod';
import { AvatarConfigSchema, DEFAULT_AVATAR_CONFIG } from './avatar';

export const ChildFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(60, 'First name must be 60 characters or fewer')
    .refine((value) => !/\d/.test(value), 'First name should not contain numbers'),
  pronoun: z.enum(['she', 'he', 'they']),
  className: z.string().trim().max(80).optional().or(z.literal('')),
  preferredLanguage: z.enum(['en', 'ar']),
  avatarConfig: AvatarConfigSchema.default(DEFAULT_AVATAR_CONFIG),
});
export type ChildFormInput = z.infer<typeof ChildFormSchema>;

/**
 * CSV import schema for bulk class-list uploads. Column order:
 * first_name,pronoun,class_name,preferred_language
 * pronoun/preferred_language are case-insensitive and default sensibly so
 * a nursery admin's spreadsheet doesn't need to be pixel-perfect.
 */
const CSV_HEADER = ['first_name', 'pronoun', 'class_name', 'preferred_language'];

export interface CsvRowResult {
  row: number;
  data?: ChildFormInput;
  errors?: string[];
}

function normalizePronoun(value: string): 'she' | 'he' | 'they' {
  const v = value.trim().toLowerCase();
  if (v === 'she' || v === 'her' || v === 'f' || v === 'female') return 'she';
  if (v === 'he' || v === 'him' || v === 'm' || v === 'male') return 'he';
  return 'they';
}

function normalizeLanguage(value: string): 'en' | 'ar' {
  const v = value.trim().toLowerCase();
  if (v === 'ar' || v === 'arabic' || v === 'العربية') return 'ar';
  return 'en';
}

/** Minimal, dependency-free CSV parser: handles quoted fields and commas. */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export function parseChildrenCsv(content: string): { results: CsvRowResult[]; headerError?: string } {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    return { results: [], headerError: 'The file is empty.' };
  }

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const expectedSet = new Set(CSV_HEADER);
  const hasAllColumns = CSV_HEADER.every((col) => header.includes(col));
  if (!hasAllColumns) {
    return {
      results: [],
      headerError: `The first row must contain these columns: ${CSV_HEADER.join(', ')}. Found: ${header.join(', ')}`,
    };
  }

  const colIndex = (name: string) => header.indexOf(name);
  const results: CsvRowResult[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const firstName = (cells[colIndex('first_name')] ?? '').trim();
    const pronounRaw = cells[colIndex('pronoun')] ?? 'they';
    const className = (cells[colIndex('class_name')] ?? '').trim();
    const languageRaw = cells[colIndex('preferred_language')] ?? 'en';

    const parsed = ChildFormSchema.safeParse({
      firstName,
      pronoun: normalizePronoun(pronounRaw),
      className: className || undefined,
      preferredLanguage: normalizeLanguage(languageRaw),
      avatarConfig: DEFAULT_AVATAR_CONFIG,
    });

    if (parsed.success) {
      results.push({ row: i + 1, data: parsed.data });
    } else {
      results.push({
        row: i + 1,
        errors: parsed.error.issues.map((issue) => issue.message),
      });
    }
  }

  void expectedSet;
  return { results };
}
