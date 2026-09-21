# Handoff — Phase 1 through Phase 4 scaffolding

*Last updated: this session. Builds on the initial foundation build from
an empty repository.*

## New this session: real Gemini image generation, photo upload, PDF redesign

This session made real (paid) AI image generation and photo-based
character consistency actually usable end-to-end, and fixed a serious
pre-existing bug in the PDF output:

- **Google Gemini is now the wired-up image vendor.**
  `GeminiImageProvider` (`gemini-2.5-flash-image`, "nano banana")
  plugs into the existing spend-cap/safety-check pipeline; switching
  from the free mock illustrations to real Gemini generation is now
  just `FEATURE_REAL_IMAGE_PROVIDER=on` + `GEMINI_API_KEY` (see
  `docs/NEEDS_FROM_ME.md` item 4). Gemini generates illustration art
  only — it never draws story text into the image; all text is still
  rendered by this platform's own tested Arabic-shaping PDF pipeline.
  See `docs/DECISIONS.md` "Real image generation: Google Gemini".
- **Photo-based character consistency**, fully built and gated behind
  `FEATURE_PHOTO_PERSONALIZATION` + `PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE`
  + per-tenant opt-in + granted photo-scoped consent (all four,
  independently checked): a nursery can upload a reference photo of a
  child once a parent has consented to it, and Gemini uses it (plus the
  earliest already-generated page) as a visual reference so the child's
  illustrated character looks consistent across every page. Still off
  by default — see `docs/DECISIONS.md` "Photo personalisation wiring"
  and `docs/NEEDS_FROM_ME.md` item 5a for the legal review this needs
  first.
- **PDF story pages were redesigned** to a full-bleed illustration with
  a repeating scalloped title banner and a soft pastel caption band, to
  match a reference sample PDF the founder provided.
- **Found and fixed a real bug while verifying that redesign visually**
  (something nothing in the automated suite ever did): essentially no
  PDF text, Arabic or Latin, on any page of any story this codebase has
  ever generated, actually rendered in a real PDF viewer — it silently
  measured fine internally but drew almost nothing. Root cause and fix
  are in `docs/DECISIONS.md` "Bug fix: Arabic (and Latin) PDF text was
  silently not rendering" — this is worth reading even if you skip
  everything else in this handoff.

All 146 automated tests still pass, `npm run build` and `npm run lint`
are clean, and the fix above was independently verified by rendering
real output PDFs through two different PDF engines (MuPDF and
Chromium's PDFium), not just by re-running the test suite.

## Phase 4 scaffolding (families + gifting) — prior session

Per the product brief, Phase 4 (consumer/family expansion) only starts
once the B2B core is complete — it now is, so this session scaffolded
the two web-buildable parts of Phase 4:

- **Family accounts**: `/family/sign-up` lets an individual parent
  create their own account. Under the hood this is a `tenants` row with
  `tenant_type = 'family'`, reusing every piece of nursery
  infrastructure (RLS, children, avatars, story generation, quotas,
  deletion) rather than a parallel system — see
  `docs/DECISIONS.md` "Phase 4: families are tenants". Adding a child
  under a family account auto-grants consent (the account owner IS the
  guardian — no multi-party "ask a parent" flow needed), proven by a
  database trigger test.
- **Gifting**: `/gift` sells story-credit packs via Stripe Checkout
  (one-time payment, reuses the existing webhook/idempotency
  infrastructure); `/gift/redeem/[code]` lets the recipient — with a
  free family account — redeem the code straight into their quota. Gift
  codes follow the exact same hash-only trust model as consent tokens.
- **Not built**: native mobile apps, push notifications, and print
  fulfilment remain genuinely out of scope (need a native app project,
  push credentials, and a print vendor contract respectively — none of
  which exist). Email delivery of gift codes also isn't wired up yet
  (the code is shown on-screen/in a link instead) — see
  `docs/NEEDS_FROM_ME.md` item 6a.

12 new automated tests cover family-tenant creation, the auto-consent
trigger (and its no-op on nursery tenants), family-tenant isolation, and
every gift-redemption edge case (double-redemption, unpaid, wrong
tenant, forged direct writes) — all against real Postgres/RLS, not
mocks. Total: **146 unit/integration tests + 16 E2E tests, all passing.**

## What exists right now (Phase 1-3, from prior sessions)

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
- **Story themes**: **8** database-driven templates (healthy eating,
  brushing teeth, first day at school, welcoming a new sibling, honesty,
  hand-washing, saving money/financial literacy, National Day gratitude —
  the full list from the product brief), each with English (reviewed) and
  Arabic (draft, pending native review) content, gendered pronoun handling
  in both languages, validated by an automated test that checks every
  theme/locale/pronoun combination renders with no leftover tokens.
- **Story generation**: `ImageProvider` abstraction with a working
  `MockImageProvider` (free, instant, deterministic placeholder
  illustrations) and a `RealImageProvider` implementation that is fully
  wired for spend caps + a mandatory, fail-closed image safety check —
  only the actual vendor HTTP call is a documented stub (see
  `docs/NEEDS_FROM_ME.md`). Postgres-backed job queue with atomic
  claiming, retries with exponential backoff, and per-page regeneration.
- **Image safety checks**: every real-generated image must pass a safety
  checker before it can be used. With no moderation vendor configured
  (the default), the checker **fails closed** — every image is blocked —
  rather than defaulting to "safe". Spend is still recorded even when an
  image is rejected, since the vendor already charged for the attempt.
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
- **Billing**: plans, coupons, subscriptions, quotas, and a fully
  implemented Stripe integration — checkout session creation, customer
  portal redirect, and a webhook handler with real signature verification
  and database-enforced idempotency (a retried Stripe delivery cannot
  double-apply a subscription change). Coupons are validated against our
  own table before Stripe is ever contacted. **Not yet connected to a
  real Stripe account** — see `docs/NEEDS_FROM_ME.md`. The billing UI on
  the settings page stays hidden until `FEATURE_BILLING=on`.
- **Owner dashboard** (`/owner`, platform-owner only, **now requires
  two-factor authentication**): tenant list, which Arabic templates still
  need native review, global AI spend/kill switch status. First visit
  walks the owner through TOTP enrollment (QR code, any authenticator
  app); every session after that requires a fresh 6-digit code before any
  owner data is even queried, let alone rendered.
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
supabase/migrations/0009_family_and_gifts.sql

npm run db:seed   # seeds the 8 story themes + plans
npm run db:reset  # optional: seeds a full demo tenant with sample data
```

To turn on billing once you have a Stripe test account (see
`docs/NEEDS_FROM_ME.md`): set `FEATURE_BILLING=on`,
`STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY`/`STRIPE_WEBHOOK_SECRET`, and
add `stripe_price_id_monthly`/`stripe_price_id_annual` to each row in the
`plans` table.

## What was tested, and the results

**146 unit/integration tests + 16 Playwright E2E tests, all passing**
(`npm test` / `npm run test:e2e`):

- 22 test files: 10 unit (pure logic — templates, seed-template
  validation, avatar config, CSV parsing, consent tokens, job
  retry/backoff math, coupon validation, Stripe event mapping, the
  RealImageProvider spend/safety pipeline, rate limiting) and 12
  integration (against a real, throwaway PostgreSQL database with our
  actual migrations and RLS policies applied — see
  `tests/integration/db/setup.ts`).
- **Family tenants & auto-consent** (4 tests): `create_family_tenant`
  produces a correctly-typed tenant + starter quota; a child added under
  a family tenant gets `consent_status = 'granted'` automatically; a
  nursery tenant is completely unaffected by that trigger; family-tenant
  isolation holds exactly like nursery isolation does.
- **Gift redemption** (8 tests): public gift-status lookup works
  anonymously; redemption credits the right tenant's quota exactly once
  (a second redemption attempt is rejected); an unpaid, unknown, or
  wrong-tenant redemption is rejected; no client role can write directly
  to the `gifts` table.
- **Job queue RLS** (4 tests): a real, now-fixed bug caught by manual
  security review — `story_jobs` was missing an INSERT policy, which
  would have made every story creation and page regeneration fail
  outright against real RLS. See `docs/DECISIONS.md` "Security review
  finding (fixed)".
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
- **Stripe webhook idempotency** (4 tests): a duplicate event id hits a
  real Postgres unique-violation on retry; different event ids are
  recorded independently; no client role (only the service role) can
  write to the idempotency table at all.
- **Coupon validation & Stripe event mapping** (25 tests): every
  active/inactive/expired/exhausted coupon combination; every Stripe
  subscription status maps to exactly one of our own statuses and an
  unrecognised one throws rather than guessing; subscription period
  fields are read from the correct (current, non-deprecated) location in
  Stripe's object shape.
- **RealImageProvider pipeline** (5 tests): blocks before ever calling
  the vendor when the spend cap is hit; records spend and returns the
  image when the safety checker approves; blocks the image (spend still
  recorded) when the safety checker rejects it; **fails closed** with no
  safety provider configured; wraps a vendor failure as retryable.
- **Seed template integrity** (6 tests): all 8 themes have both locales;
  every row validates against the runtime schema; English is always
  "reviewed" and Arabic always "draft"; every theme renders for every
  pronoun (she/he/they) in both languages with zero leftover
  `{unsubstituted}` tokens.

Also verified manually this session: `npm run build` completes
successfully (36 routes, no errors), `npm run typecheck` is clean, and
`npm run lint` passes (3 non-blocking warnings about using `<img>`
instead of `next/image` for Supabase-signed URLs — intentional, since
those URLs are per-request and short-lived).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the full unit/
integration suite against a Postgres service container, a production
build, and the Playwright E2E suite (headless Chromium) on every
push/PR.

## Known limitations

- No live Supabase project was available in this build session — the
  schema and RLS are proven against a real Postgres instance with a
  minimal stand-in for Supabase's `auth`/`storage` schemas (see
  `docs/DECISIONS.md` "Test database strategy"), but Supabase Auth's own
  token issuance, MFA/TOTP enrollment flow, and Storage's HTTP
  file-serving layer have not been exercised end-to-end against a real
  Supabase project yet. Do that once a project exists, before go-live.
- `GeminiImageProvider` is fully implemented, but no real
  `GEMINI_API_KEY` has ever been used against it in this build session —
  it's been tested against the mock provider and via unit tests only
  (`docs/NEEDS_FROM_ME.md` item 4). `VendorModerationSafetyChecker` is
  still a documented stub needing a chosen moderation vendor
  (`docs/NEEDS_FROM_ME.md` item 4a). Everything around them (spend caps,
  idempotent recording, fail-closed safety gating) is real and tested.
- Photo-based personalisation is fully implemented and gated off by
  default, pending the legal review in `docs/NEEDS_FROM_ME.md` item 5a.
- The Stripe billing routes have never made a real network call to
  Stripe — no test account exists yet. The code is fully implemented and
  the parts that don't need Stripe itself (coupon validation, event
  mapping, webhook idempotency) are tested against real logic/DB
  behaviour, not mocks.
- Every Arabic string in the product (UI + all 8 story templates) needs
  native review before real families see it — the system technically
  blocks this already (see `docs/DECISIONS.md` "Arabic content gating"),
  but the wording itself hasn't been checked by a native speaker.
- Single-tenant-per-session (see `docs/DECISIONS.md`).
- E2E coverage (16 Playwright tests) is deliberately limited to pages
  that render without a live Supabase project (marketing, auth forms,
  family sign-up, the gift page). The full authenticated user journey
  (sign up → add a child → consent → generate → approve → PDF) needs a
  real or `supabase start` Supabase project to test honestly — see
  `docs/DECISIONS.md` "E2E test scope".
- PDF bold text currently renders at the same weight as regular (no bold
  static instance embedded yet) — see `docs/DECISIONS.md` "PDF font
  weights".
- Owner impersonation tooling (with mandatory audit trail) is not built.
- Gift codes are not emailed — shown on-screen/in-link only (no
  transactional email provider configured yet; see
  `docs/NEEDS_FROM_ME.md` item 6a).

## Decisions made along the way

See `docs/DECISIONS.md` for the full, itemized log (brand name, palette,
Arabic gating, job queue design, storage security, retention default,
spend caps, Stripe test-mode safety gate, owner MFA, image-safety
fail-closed default, and more).

## Unresolved issues

- None blocking. Everything above under "Known limitations" is tracked,
  not broken.

## Exact next step

Create the Supabase project (`docs/NEEDS_FROM_ME.md` item 1) so the
schema, Auth (including the MFA and family-sign-up flows just built),
and Storage can be exercised end-to-end against the real thing — that
unblocks a genuine pilot with a real nursery (or a family, via
`/family/sign-up`) using the mock image provider (zero cost) while the
Gemini API key and legal-review items in `docs/NEEDS_FROM_ME.md` are
worked through in parallel. Once both the Supabase project and the
Gemini key exist, flipping `FEATURE_REAL_IMAGE_PROVIDER` to `on` is the
one step that moves a pilot from free mock illustrations to real
AI-generated art — everything downstream of that flag (spend caps,
safety gating, PDF rendering) is already built and tested.
