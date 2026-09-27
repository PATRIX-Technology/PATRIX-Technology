-- ============================================================================
-- 0024_story_template_suggestions.sql
-- Founder-requested feature: any tenant (nursery or family) can suggest
-- a new story theme/habit idea from the Stories page. Saved here as a
-- durable record (so nothing is lost even if the submitter doesn't
-- follow through on the WhatsApp step the UI also offers), reviewable
-- by the platform owner across every tenant. See docs/DECISIONS.md
-- "Story template suggestions".
-- ============================================================================

create type story_suggestion_status as enum ('new', 'reviewed', 'added', 'declined');

create table story_template_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  submitted_by uuid references profiles (id) on delete set null,
  topic text not null,
  description text not null,
  status story_suggestion_status not null default 'new',
  created_at timestamptz not null default now()
);

comment on table story_template_suggestions is
  'Story theme/habit ideas suggested by nurseries and families from the Stories page. The founder reviews these (via WhatsApp and/or directly in this table) and, if he wants to run with one, brings it to a session to actually build the template -- this table only tracks the idea, never generates a template itself.';

create index story_template_suggestions_tenant_id_idx on story_template_suggestions (tenant_id);

alter table story_template_suggestions enable row level security;

create policy "story_template_suggestions_tenant_select" on story_template_suggestions
  for select using (is_tenant_member(tenant_id) or is_platform_owner());

create policy "story_template_suggestions_tenant_insert" on story_template_suggestions
  for insert with check (is_tenant_member(tenant_id) and submitted_by = auth.uid());

-- Only the founder can move a suggestion out of 'new' -- the submitter
-- has no legitimate reason to edit their own suggestion's review state.
create policy "story_template_suggestions_owner_update" on story_template_suggestions
  for update using (is_platform_owner()) with check (is_platform_owner());
