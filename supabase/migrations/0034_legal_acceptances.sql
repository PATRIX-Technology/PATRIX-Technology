-- ============================================================================
-- 0034_legal_acceptances.sql
-- Append-only audit log of explicit Terms of Service / Privacy Policy
-- acceptance at sign-up -- PDPL requires a recorded, timestamped, explicit
-- consent, not an implied one from merely continuing past a text note.
-- Mirrors the consent_requests pattern in 0002_children_consent.sql: one
-- row per acceptance event, never updated or deleted.
-- ============================================================================

create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid references tenants (id) on delete set null,
  document_version text not null,
  ip text,
  accepted_at timestamptz not null default now()
);

create index legal_acceptances_user_id_idx on legal_acceptances (user_id);

comment on table legal_acceptances is
  'Append-only record of explicit Terms of Service / Privacy Policy acceptance at sign-up, for PDPL audit purposes. One row per acceptance event; never updated.';
comment on column legal_acceptances.document_version is
  'Identifies which revision of the Terms/Privacy text was shown and accepted -- see LEGAL_TERMS_VERSION in src/lib/domain/legal.ts.';

alter table legal_acceptances enable row level security;

-- Insert-only for the user themselves -- there is deliberately no update or
-- delete policy; the audit trail is append-only by design, same as
-- consent_requests.
create policy "legal_acceptances_self_insert" on legal_acceptances
  for insert with check (user_id = auth.uid());

create policy "legal_acceptances_self_select" on legal_acceptances
  for select using (user_id = auth.uid() or is_platform_owner());
