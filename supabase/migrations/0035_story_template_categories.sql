-- ============================================================================
-- 0035_story_template_categories.sql
-- Groups story theme templates into categories (Family, Nurseries, Gifts,
-- Educational, Entertainment, ...) for the template picker UI. A plain
-- text column rather than an enum, deliberately, so a new category can be
-- introduced later just by seeding a template with it -- no migration
-- needed each time. See supabase/seed/templates.json for the current
-- category assignment per theme_key.
-- ============================================================================

alter table story_theme_templates
  add column category text not null default 'educational';

comment on column story_theme_templates.category is
  'Groups templates in the picker UI (e.g. family, nurseries, gifts, educational, entertainment). Free-form text, not an enum, so new categories need no migration -- just set it on the seeded row in supabase/seed/templates.json.';
