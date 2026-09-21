# Handoff — Phase 1 + Phase 2A + Phase 2B (foundation build)

*Last updated: this session, initial build from an empty repository.*

## What exists right now

A working Next.js 14 (App Router, strict TypeScript) web app implementing
the full B2B core loop end-to-end against a real Postgres schema with row
level security, tested against real RLS enforcement (not mocks):

- **Marketing home page**, English + Arabic, RTL/LTR switching.
- **Auth + onboarding**: sign up creates an organisation (tenant) and
  makes you its owner in one atomic step; sign in/out.
- **Roles**: Platform Owner, Nursery Owner, Nursery Admin, Nursery Staff —
  enforced by Postgres RLS policies and SECURITY DEFINER RPCs, not just
  UI hiding.
- **Children**: add one at a time or bulk-import a CSV class list, with a
  fully photo-free structured avatar (hair / skin tone / outfit colour /
  accessory) rendered as SVG.
- **Consent**: generate a link + QR code per child, a public
  (no-login-required) consent page for the parent, grant/decline/withdraw,
  all backed by token-hash verification (the raw token is never stored).
  Withdrawing consent deletes that child's generated story assets.
- **Deletion**: deleting a child cascades to their stories, pages, jobs,
  consent history, and Storage files, and writes a PII-free audit log
  entry.
- **Story themes**: 6 database-driven templates (healthy eating,
  brushing teeth, first day at school, welcoming a new sibling, honesty,
  hand-washing), each with English (reviewed) and Arabic (draft, pending
  native review) content, gendered pronoun handling in both languages.
- **Story generation**: `ImageProvider` abstraction with a working
  `MockImageProvider` (free, instant, deterministic placeholder
  illustrations) and a `RealImageProvider` skeleton (not wired to a
  vendor yet — see `docs/NEEDS_FROM_ME.md`). Postgres-backed job queue
  with atomic claiming, retries with exponential backoff, and per-page
  regeneration.
- **Approval workflow**: nothing reaches a parent or PDF until a staff
  member explicitly approves it; a story cannot be approved while any
  page is still generating.
- **Story reader**: swipe/keyboard/click navigation, RTL/LTR aware,
  screen-reader live region, respects `prefers-reduced-motion`.
- **Print-ready PDF export**: A5, 3mm bleed, TrimBox/BleedBox set, real
  embedded OFL fonts (Latin + Arabic), Arabic contextual shaping + bidi
  reordering, a preflight validator that **fails loudly** (wrong
  dimensions, missing bleed box, missing assets, unsupported characters,
  wrong page count) rather than ever handing out a broken file. Bulk ZIP
  export per class.
- **Quotas + AI spend caps**: enforced atomically in the database
  (`consume_story_quota`, `record_ai_spend`/`can_spend`), including a
  global kill switch that defaults to **on** (blocked) until the
  platform owner explicitly configures it.
- **Owner dashboard** (`/owner`, platform-owner only): tenant list,
  which Arabic templates still need native review, global AI spend/kill
  switch status.
- **Billing schema**: plans, coupons, subscriptions, quota, and Stripe
  webhook-idempotency tables exist and are ready for the actual Stripe
  SDK integration — no live/test Stripe calls are wired yet (needs your
  Stripe keys, see `docs/NEEDS_FROM_ME.md`).
- **PWA basics**: manifest, installable, RTL/LTR + light/dark design
  tokens.

## How to run it

```bash
npm install
cp .env.example .env.local   # fill in Supabase project details once you have one
npm run dev                  # http://localhost:3000
```

Without a real Supabase project, the app builds and the marketing pages
render, but anything requiring auth/data needs a Supabase project — see
`docs/NEEDS_FROM_ME.md` item 1. Once you have one:

```bash
# Apply the schema (via the Supabase SQL editor, or psql against the
# project's connection string) in order:
supabase/migrations/0001_core_schema.sql
supabase/migrations/0002_children_consent.sql
supabase/migrations/0003_templates_stories.sql
supabase/migrations/0004_billing_quotas.sql
supabase/migrations/0005_spend_caps_audit.sql
supabase/migrations/0006_job_queue_functions.sql
supabase/migrations/0007_storage.sql
supabase/migrations/0008_consent_lookup.sql

npm run db:seed   # seeds the 6 story themes + plans
npm run db:reset  # optional: seeds a full demo tenant with sample data
```

## What was tested, and the results

**85 automated tests, all passing** (`npm test`):

- 13 test files: 5 unit (pure logic — templates, avatar config, CSV
  parsing, consent tokens, job retry/backoff math) and 8 integration
  (against a real, throwaway PostgreSQL database with our actual
  migrations and RLS policies applied — see
  `tests/integration/db/setup.ts`).
- **Tenant isolation** (9 tests): proven at the database level — a
  second tenant's owner cannot read, insert into, update, or delete
  another tenant's children, even via a direct SQL statement, and gets 0
  rows back rather than an error (the correct RLS behaviour).
- **Storage isolation** (4 tests): the same guarantee for Storage
  objects, keyed by the tenant-id path prefix.
- **Consent workflow** (6 tests): token-based grant/decline, double-answer
  rejection, expiry, staff-initiated withdrawal, cross-tenant withdrawal
  blocked.
- **Quotas & spend caps** (7 tests): hard cap blocks the Nth story
  without incrementing usage; the AI spend kill switch flips atomically
  the instant a cap is reached, and defaults to blocked on a fresh
  database.
- **Story approval & Arabic template gating** (5 tests): approval refused
  until every page is generated; only the platform owner can flip an
  Arabic template to "reviewed".
- **PDF rendering + preflight** (6 tests): a real PDF is rendered (with
  real embedded fonts) for both an English and an Arabic story and passes
  preflight; preflight correctly fails on a missing asset, an
  English/Arabic character mismatch, a wrong page count, and a corrupt
  file.

Also verified manually this session: `npm run build` completes
successfully (22 routes, no errors), `npm run typecheck` is clean, and
`npm run lint` passes (3 non-blocking warnings about using `<img>`
instead of `next/image` for Supabase-signed URLs — intentional, since
those URLs are per-request and short-lived).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the full test suite
against a Postgres service container, and a production build on every
push/PR.

## Known limitations

- No live Supabase project was available in this build session — the
  schema and RLS are proven against a real Postgres instance with a
  minimal stand-in for Supabase's `auth`/`storage` schemas (see
  `docs/DECISIONS.md` "Test database strategy"), but Supabase Auth's own
  token issuance and Storage's HTTP file-serving layer have not been
  exercised end-to-end. Do that once a project exists, before go-live.
- `RealImageProvider` and Stripe checkout/webhooks are architected but
  not implemented against a real vendor — both need credentials only you
  can provide (`docs/NEEDS_FROM_ME.md`).
- Every Arabic string in the product (UI + all 6 story templates) needs
  native review before real families see it — the system technically
  blocks this already (see `docs/DECISIONS.md` "Arabic content gating"),
  but the wording itself hasn't been checked by a native speaker.
- Single-tenant-per-session (see `docs/DECISIONS.md`).
- No automated E2E (Playwright) tests yet — `@playwright/test` is
  installed and `npm run test:e2e` is wired up, but no test files exist
  yet. Next priority for Phase 2B hardening.
- PDF bold text currently renders at the same weight as regular (variable
  font default instance) — see `docs/DECISIONS.md` "PDF font weights".

## Decisions made along the way

See `docs/DECISIONS.md` for the full, itemized log (brand name, palette,
Arabic gating, job queue design, storage security, retention default,
spend caps, and more).

## Unresolved issues

- None blocking. Everything above under "Known limitations" is tracked,
  not broken.

## Exact next step

Create the Supabase project (`docs/NEEDS_FROM_ME.md` item 1) so the
schema can be applied for real, Supabase Auth can be exercised
end-to-end, and Phase 3 (Stripe test-mode wiring, real image provider
integration behind its feature flag, owner MFA) can begin.
