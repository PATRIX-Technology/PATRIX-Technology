-- ============================================================================
-- 0018_pronoun_snapshot.sql
-- The illustration prompt sent to Gemini (buildIllustrationPrompt in
-- src/lib/providers/image/prompts.ts) described the avatar's hair, skin
-- tone, outfit, and accessory -- but never told Gemini the child's gender
-- at all, for a story generated from the avatar config (i.e. no reference
-- photo). With no gender signal in the prompt, Gemini has to guess how to
-- render "the child character", which is why illustrations skewed toward
-- a boy-presenting character regardless of the child's actual pronoun on
-- file -- the pronoun was already used correctly for story TEXT (see
-- src/lib/domain/pronouns.ts's English pronoun forms and Arabic verb
-- conjugations, already wired via renderTemplate), just never passed to
-- the image side at all.
--
-- Mirrors avatar_config_snapshot exactly: a copy taken at story-creation
-- time, so editing a child's pronoun later doesn't change an in-progress
-- or already-approved story's illustrations mid-way through.
-- ============================================================================

alter table stories add column pronoun_snapshot pronoun_type;

-- Backfill every existing story from its child's current pronoun -- the
-- closest available truth for a value that was never captured before now.
update stories
set pronoun_snapshot = children.pronoun
from children
where children.id = stories.child_id
  and stories.pronoun_snapshot is null;

alter table stories alter column pronoun_snapshot set default 'they';
alter table stories alter column pronoun_snapshot set not null;

comment on column stories.pronoun_snapshot is
  'Copy of the child pronoun at story-creation time, same reasoning as avatar_config_snapshot -- also the only place a story''s gender presentation is available to the image-generation prompt (see docs/DECISIONS.md "Gender in the illustration prompt").';
