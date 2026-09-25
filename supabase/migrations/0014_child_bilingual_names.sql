-- ============================================================================
-- 0014_child_bilingual_names.sql
-- Optional Arabic first/family name, and an optional English family name,
-- for a child — see docs/DECISIONS.md "Bilingual name fields for
-- children". All nullable and unconstrained beyond a length cap: most
-- nurseries will only ever fill in first_name and leave the rest blank.
--
-- Naming used consistently everywhere (DB columns, story generation,
-- forms, the children table):
--   first_name         -> "First name (EN)" — required, pre-existing
--   last_name          -> "Family name (EN)"
--   arabic_first_name  -> "First name (AR)"
--   arabic_last_name   -> "Family name (AR)"
-- ============================================================================

alter table children
  add column last_name text check (char_length(last_name) <= 60),
  add column arabic_first_name text check (char_length(arabic_first_name) <= 60),
  add column arabic_last_name text check (char_length(arabic_last_name) <= 60);

comment on column children.last_name is
  'Optional English family name.';
comment on column children.arabic_first_name is
  'Optional Arabic spelling of the first name. When set, used instead of first_name for Arabic-locale story generation (text + illustration caption).';
comment on column children.arabic_last_name is
  'Optional Arabic spelling of the family name. Record-keeping only — never used in story generation, which uses first names only.';
