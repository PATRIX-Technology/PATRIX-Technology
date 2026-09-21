# Privacy & data handling (engineering posture — PENDING LEGAL REVIEW)

This document describes what the system technically does. It is **not**
a legal compliance statement. See `docs/NEEDS_FROM_ME.md` for the
required professional legal review, particularly regarding the UAE
Federal Decree-Law No. 45 of 2021 (PDPL) and any cross-border/data
residency questions specific to your Supabase project's hosting region.

## What child data we store

First name, pronoun, class/group name, preferred language, and a
structured avatar configuration (hair/skin tone/outfit colour/accessory
— never a photo). See `children` table,
`supabase/migrations/0002_children_consent.sql`.

## Consent

Every story requires explicit, revocable parental consent, recorded
against a specific child with a timestamp, obtained through a public
link/QR code that requires no parent account. The scope of what's
consented to is explicit (`consent_requests.scope`) and photo-based
personalisation cannot be consented to unless the platform owner has
separately enabled that feature and completed legal review — see
`docs/DECISIONS.md` "No photo personalisation at launch."

## Data isolation between organisations

Enforced by Postgres Row Level Security, not application code alone —
see `docs/DECISIONS.md` "Test database strategy" for how this is proven
by automated tests against real RLS enforcement.

## Storage

All generated illustrations and PDFs live in a private Storage bucket.
No public URLs are ever issued; every link the browser receives is a
signed URL that expires after 10 minutes.

## Retention & deletion

Configurable per organisation (`tenants.data_retention_days`, default 730
days / 24 months). Deleting a child cascades to every story, page, job,
and consent record referencing them, and removes the underlying files
from Storage — see `src/lib/domain/deletion.ts`. Withdrawing consent
alone (without deleting the child record) removes that child's generated
story assets specifically.

## Audit logging

Actions like child deletion and consent withdrawal are logged
(`audit_logs` table) without personal data — action type, actor,
target id, and non-identifying counts only.

## What is explicitly NOT done yet

- No formal Data Protection Impact Assessment.
- No confirmed data residency commitment (depends on which Supabase
  region you choose).
- No cross-border transfer analysis.
- No finalized data retention/deletion SLA communicated to customers.

All of the above belong in `docs/NEEDS_FROM_ME.md` until a qualified
legal reviewer has been engaged.
