# Khayali — Personalised Storybook Platform

A B2B-first SaaS platform for nurseries, schools, clinics, and children's
brands to create personalised, illustrated storybooks that teach children
values and habits — the child's own name, avatar, and language, front and
center.

> **Status:** Phase 1 + Phase 2A + Phase 2B foundation built and tested.
> See `docs/HANDOFF.md` for exactly what exists, what was tested, and
> what's next. If you're the non-technical founder this was built for,
> start there — not here.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project details
npm run dev                  # http://localhost:3000/en
```

## Stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **Supabase**: Postgres + Auth + Storage, with Row Level Security as the
  primary tenant-isolation boundary (not just application code)
- **Tailwind CSS**, a small hand-built design system (`src/components/ui`)
- **next-intl** for English/Arabic with full RTL/LTR support
- **pdf-lib** + vendored open-licensed fonts for print-ready A5 PDF export
- **Vitest** for unit + integration tests (integration tests run against a
  real, throwaway PostgreSQL database — see `tests/integration/db/setup.ts`)

## Project structure

```
src/
  app/[locale]/...        Next.js App Router pages (marketing, auth, dashboard, consent, owner)
  app/api/...              PDF export, bulk ZIP, cron worker routes
  components/               UI design system + feature components
  lib/domain/                Pure business logic (templates, consent, avatar, deletion, quotas)
  lib/providers/image/      ImageProvider abstraction (Mock + Real)
  lib/providers/pdf/         PDF rendering, Arabic shaping, preflight validation
  lib/jobs/                  Story-generation job queue worker
  lib/supabase/               Browser / server / service-role Supabase clients
supabase/
  migrations/                 The actual database schema + RLS policies (source of truth)
  seed/                        Story theme template content
  testing/                     Minimal auth/storage schema stand-ins used ONLY by tests
tests/
  unit/                        Pure-logic tests, no database
  integration/                 Tests against a real Postgres instance with real RLS
docs/                          See below
```

## Documentation

- `docs/HANDOFF.md` (and `docs/ar/HANDOFF.md`) — what exists, what was
  tested, what's next. Updated at the end of every phase.
- `docs/DECISIONS.md` — every non-obvious technical/brand/product decision
  made autonomously, with reasoning.
- `docs/NEEDS_FROM_ME.md` — the short list of things that genuinely need
  the founder (accounts, credentials, legal/commercial decisions).
- `docs/LICENSES.md` — every third-party asset/font/package license.
- `docs/TEST_CHECKLIST.md` — 8 plain-language manual checks, no coding
  knowledge required.
- `docs/en/` / `docs/ar/` — bilingual product/brand/pricing/privacy
  documentation, plus `launch-runbook.md` (deploy steps) and
  `pilot-plan.md` (running a first real pilot with a nursery).

## Testing

```bash
npm test          # unit + integration (spins up a local Postgres db per test file)
npm run typecheck
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR
against a Postgres service container.

## Security & privacy posture

Tenant isolation, consent tracking, private storage with signed URLs,
configurable retention, PII-free audit logs, hard AI spend caps, and a
photo-personalisation feature flag that stays off until explicitly
enabled. None of this is a legal compliance claim — see
`docs/NEEDS_FROM_ME.md` for the pending legal review.
