-- ============================================================================
-- 0041_child_bilingual_stories_preference.sql
-- A per-child preference: whether this child's stories should default to
-- being generated in BOTH English and Arabic at once (one bilingual book)
-- rather than a single locale. Nullable-safe default `false` so every
-- existing child keeps today's single-locale behaviour unchanged.
--
-- Set via the manual add/edit child form and the CSV bulk-import template
-- (optional `bilingual` column — see src/lib/domain/children.ts). Consumed
-- by story generation once the bilingual-in-one-book feature itself is
-- built (see docs/DECISIONS.md "Bilingual-in-one-book generation") as the
-- pre-checked default for that child's "Generate in both languages"
-- toggle — a stored preference, not a hard requirement, so staff can still
-- override it per story.
-- ============================================================================

alter table children
  add column bilingual_stories boolean not null default false;

comment on column children.bilingual_stories is
  'Whether this child''s stories should default to being generated in both English and Arabic at once. A per-child preference, overridable per story -- see docs/DECISIONS.md "Bilingual-in-one-book generation".';
