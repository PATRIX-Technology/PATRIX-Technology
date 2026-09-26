# Bulk CSV import — children roster

Nursery/school tenants can add many children at once instead of one at a
time, via **Dashboard → Children → Import CSV**. A ready-to-fill template
is downloadable from that same dialog, and also lives in the repo at
`public/templates/children-import-template.csv`.

This is a nursery/B2B workflow only — a family tenant has one or two
children and never sees this button (`context.tenantType === 'nursery'`
gate in `src/app/[locale]/(dashboard)/dashboard/children/page.tsx`).

## File format

- Plain CSV (UTF-8), comma-separated, first row is the header.
- Quoted fields are supported (e.g. a class name containing a comma).
- One row per child.

## Columns

| Column | Required (column must exist) | Cell can be blank? | Accepted values | Notes |
|---|---|---|---|---|
| `first_name` | Yes | No | Any text, no digits, ≤60 chars | The child's given name. Used in the English story text (or as a fallback for Arabic stories with no `arabic_first_name`). |
| `last_name` | No | Yes | Any text, no digits, ≤60 chars | Record-keeping only — never used in story generation. |
| `arabic_first_name` | No | Yes | Arabic script, ≤60 chars | Used instead of `first_name` when generating an Arabic-locale story, so the name reads naturally in Arabic sentences. |
| `arabic_last_name` | No | Yes | Arabic script, ≤60 chars | Record-keeping only. |
| `pronoun` | Yes | Yes (defaults to `they`) | `she`, `he`, `they` (also accepts `her`/`female` → she, `him`/`male` → he; case-insensitive) | Drives both the story text's pronouns/grammar and — since a recent fix — the gender of the illustrated character when no reference photo is used. |
| `class_name` | Yes | Yes | Any text, ≤80 chars, e.g. `KG1-A` | Used to group the roster and to name folders in a bulk PDF export. |
| `preferred_language` | Yes | Yes (defaults to `en`) | `en`, `ar` (also accepts `english`, `arabic`, `العربية`; case-insensitive) | Which language this child's stories are generated in by default. |

"Required (column must exist)" means the header row must contain that
column name — `first_name, pronoun, class_name, preferred_language` are
the four required column headers (see `CSV_HEADER` in
`src/lib/domain/children.ts`). Within a required column, individual
*cells* can still be left blank for `pronoun`, `class_name`, and
`preferred_language` (each falls back sensibly); only `first_name` must
actually have a value in every row.

## What CSV import does NOT set

- **Avatar.** Every imported child gets the same default avatar
  (`DEFAULT_AVATAR_CONFIG` — curly black hair, medium skin tone, teal
  outfit, no accessory). Customise it per child afterwards from the
  child's own page.
- **Photo consent.** Every imported child starts at `not_requested`.
  Consent still has to be requested and granted per child through the
  normal consent flow — the bulk import step never grants it
  automatically.

## Row-level error handling

Each row is validated independently (`parseChildrenCsv` in
`src/lib/domain/children.ts`). A bad row (e.g. a first name containing a
digit) is reported back with its row number and the specific error,
without failing the rows around it — the dialog shows "Imported N
children" plus a list of any row errors.

## Future: direct integration with a nursery's own system

Not built yet. The founder mentioned nurseries may eventually want to
sync their own student-management system directly rather than exporting
a spreadsheet by hand. A CSV/spreadsheet import remains the right
baseline either way (it's what most nursery admin systems can already
export), and a future integration would most naturally sit *alongside*
it as another way to populate the same `children` table — e.g. a
scheduled import job or a webhook a nursery's system calls — rather than
replacing this flow. No specific vendor or system has been named yet, so
there's nothing to design against.
