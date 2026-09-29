import { z } from 'zod';
import { AvatarConfigSchema, DEFAULT_AVATAR_CONFIG } from './avatar';

/**
 * Identifies an image file by its actual leading bytes rather than the
 * browser-supplied `file.type` — a File's `type` is just whatever the
 * client claims in the multipart request and is trivially spoofable
 * (nothing stops someone from POSTing arbitrary bytes with
 * `type: 'image/jpeg'` set). Used by uploadChildPhotoAction so both the
 * allow-list check AND the contentType actually written to Storage are
 * based on what the file really is, not what it claims to be. Returns
 * null for anything that isn't one of the three types this app accepts.
 */
export function sniffImageMimeType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Shared shape for the three optional name fields (last name, Arabic
 * first/last name) — same rules as the required first name, just optional. */
function optionalNameField(label: string) {
  return z
    .string()
    .trim()
    .max(60, `${label} must be 60 characters or fewer`)
    .refine((value) => !/\d/.test(value), `${label} should not contain numbers`)
    .optional()
    .or(z.literal(''));
}

export const ChildFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(60, 'First name must be 60 characters or fewer')
    .refine((value) => !/\d/.test(value), 'First name should not contain numbers'),
  /** Optional English family name — record-keeping only, never used in
   * story generation. */
  lastName: optionalNameField('Family name'),
  /** Optional Arabic spelling, used instead of firstName when generating
   * an Arabic-locale story — see docs/DECISIONS.md "Bilingual name
   * fields for children". */
  arabicFirstName: optionalNameField('Arabic first name'),
  /** Optional Arabic spelling of the family name — record-keeping only. */
  arabicLastName: optionalNameField('Arabic family name'),
  pronoun: z.enum(['she', 'he']),
  className: z.string().trim().max(80).optional().or(z.literal('')),
  preferredLanguage: z.enum(['en', 'ar']),
  avatarConfig: AvatarConfigSchema.default(DEFAULT_AVATAR_CONFIG),
});
export type ChildFormInput = z.infer<typeof ChildFormSchema>;

/**
 * CSV import schema for bulk class-list uploads. Required columns:
 * first_name,pronoun,class_name,preferred_language — optional
 * last_name/arabic_first_name/arabic_last_name columns are also read
 * when present (see docs/DECISIONS.md "Bilingual name fields for
 * children"), but their absence isn't an error.
 * preferred_language is case-insensitive and defaults to "en" so a
 * nursery admin's spreadsheet doesn't need to be pixel-perfect there.
 * pronoun is also case-insensitive and accepts a few loose spellings
 * (her/female/f, him/male/m), but has no default -- see
 * docs/DECISIONS.md "Pronoun is binary only (no 'they')": a missing or
 * unrecognized value is now a row error rather than a silent guess.
 */
const CSV_HEADER = ['first_name', 'pronoun', 'class_name', 'preferred_language'];

export interface CsvRowResult {
  row: number;
  data?: ChildFormInput;
  errors?: string[];
}

/** Returns null when the cell is empty or doesn't match a recognized
 * spelling -- see docs/DECISIONS.md "Pronoun is binary only (no
 * 'they')": there's no longer a default to silently fall back to, so an
 * unrecognized value is a row error the importer has to see and fix,
 * not a guess this code makes for them. */
function normalizePronoun(value: string): 'she' | 'he' | null {
  const v = value.trim().toLowerCase();
  if (v === 'she' || v === 'her' || v === 'f' || v === 'female') return 'she';
  if (v === 'he' || v === 'him' || v === 'm' || v === 'male') return 'he';
  return null;
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

/** Nothing downstream (a single bulk `.insert()` in importChildrenCsvAction)
 * ever capped how many rows one CSV could carry — a file with, say, a
 * million rows would still be fully parsed into memory and handed to
 * Postgres as one giant insert. No real nursery imports anywhere close
 * to this many children at once; it exists purely as a resource-exhaustion
 * backstop. */
export const MAX_CSV_IMPORT_ROWS = 1000;

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

  if (rows.length - 1 > MAX_CSV_IMPORT_ROWS) {
    return {
      results: [],
      headerError: `This file has ${rows.length - 1} rows, which is more than the ${MAX_CSV_IMPORT_ROWS}-row limit per import. Split it into smaller files and import them one at a time.`,
    };
  }

  const colIndex = (name: string) => header.indexOf(name);
  const results: CsvRowResult[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const firstName = (cells[colIndex('first_name')] ?? '').trim();
    const lastName = (cells[colIndex('last_name')] ?? '').trim();
    const arabicFirstName = (cells[colIndex('arabic_first_name')] ?? '').trim();
    const arabicLastName = (cells[colIndex('arabic_last_name')] ?? '').trim();
    const pronounRaw = cells[colIndex('pronoun')] ?? '';
    const className = (cells[colIndex('class_name')] ?? '').trim();
    const languageRaw = cells[colIndex('preferred_language')] ?? 'en';
    const pronoun = normalizePronoun(pronounRaw);

    if (pronoun === null) {
      results.push({
        row: i + 1,
        errors: [`Pronoun must be "she" or "he" (also accepts her/female/f or him/male/m) -- got "${pronounRaw || '(empty)'}"`],
      });
      continue;
    }

    const parsed = ChildFormSchema.safeParse({
      firstName,
      lastName: lastName || undefined,
      arabicFirstName: arabicFirstName || undefined,
      arabicLastName: arabicLastName || undefined,
      pronoun,
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
