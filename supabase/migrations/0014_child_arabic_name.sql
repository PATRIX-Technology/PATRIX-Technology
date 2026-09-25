-- ============================================================================
-- 0014_child_arabic_name.sql
-- Optional Arabic spelling of a child's name, used in place of first_name
-- when generating an Arabic-locale story — see docs/DECISIONS.md "Arabic
-- name field for children". Nullable and unconstrained: many nurseries
-- will leave it blank and the Latin first_name keeps being used as-is.
-- ============================================================================

alter table children
  add column arabic_name text check (char_length(arabic_name) <= 60);

comment on column children.arabic_name is
  'Optional Arabic spelling of the child''s name. When set, used instead of first_name for Arabic-locale story generation (text + illustration caption).';
