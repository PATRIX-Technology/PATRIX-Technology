-- Nationality is now a mandatory field on every child — founder
-- requirement from a real nursery call: a culture-specific template
-- (e.g. the UAE National Day grandmother in traditional Emirati dress)
-- shouldn't be forced onto a non-Gulf child's illustration. See
-- docs/DECISIONS.md "Nationality drives culturally-appropriate
-- illustration, not separate templates" for the architecture (a
-- {family_dress} token resolved per-nationality, rather than
-- duplicating all 15 templates per nationality).
--
-- Same enum pattern as pronoun_type/app_locale (migration 0001): a
-- top-level type, not a text + check constraint, so the valid list is
-- enforced at the database level too, not just in application code.
-- 'other' is included from day one as a deliberate catch-all/escape
-- hatch -- Postgres can't drop an enum value once added (see
-- pronoun_type's own dead 'they' member), so better to design for
-- headroom now than need a disruptive migration to add it later.
create type nationality_type as enum (
  'emirati', 'saudi', 'kuwaiti', 'qatari', 'bahraini', 'omani',
  'egyptian', 'jordanian', 'lebanese', 'syrian', 'palestinian', 'sudanese', 'yemeni',
  'indian', 'pakistani', 'bangladeshi', 'filipino',
  'british', 'american', 'canadian', 'french', 'german', 'south_african',
  'other'
);

-- Added nullable first, backfilled, then locked to not null -- the 19
-- existing rows in the live project have no nationality on file and
-- can't satisfy a not-null constraint directly. 'other' is the honest
-- backfill value (unknown, not a guess at a specific nationality);
-- nurseries should update each existing child's real nationality from
-- their profile page once this ships.
alter table children add column nationality nationality_type;
update children set nationality = 'other' where nationality is null;
alter table children alter column nationality set not null;

comment on column children.nationality is
  'Drives culturally-appropriate illustration (see {family_dress} token in src/lib/domain/templates.ts and src/lib/domain/nationality.ts) -- not used for any legal/compliance purpose.';
