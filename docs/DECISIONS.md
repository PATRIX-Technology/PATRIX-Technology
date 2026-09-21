# Decisions

This log records technical, product, and brand decisions made autonomously
during the build, per the operating instructions in the original brief
("choose the strongest practical option, implement it, document it, keep
going"). Nothing here is a legal or commercial conclusion — see
`docs/NEEDS_FROM_ME.md` for anything that needs the founder or a
professional advisor.

## Brand

**Decision: working name "Hikayti" (حكايتي — "my story").**
Chosen for: warm, immediately meaningful in both English and Arabic,
short, easy to say, no obvious negative connotation in Gulf Arabic. This
is a **working name only**. No trademark search, domain availability
check, or clearance has been performed — see `docs/NEEDS_FROM_ME.md`.
Never state or imply trademark uniqueness before that clearance is done.

**Decision: brand palette — lagoon teal, saffron, coral, warm ink/cream
neutrals** (see `tailwind.config.ts`). Chosen to read as premium and
culturally warm without being generic "startup blue" or childish
primary-colour clip art, per the brief's explicit instruction to avoid
both.

**Decision: typography — Fraunces (display), Inter (Latin body), Noto
Kufi Arabic (Arabic UI) / Noto Naskh Arabic (Arabic print body).** All
three are OFL-licensed, self-hostable, and vendored directly into the
repo (`assets/fonts/`) rather than loaded from a CDN at runtime, so PDF
generation and the web app use the exact same font files. See
`docs/LICENSES.md`.

## Product / architecture

**Single active tenant per session (MVP).** `getCurrentTenantContext`
(`src/lib/domain/session.ts`) loads a user's *first* tenant membership. A
user who genuinely belongs to multiple nurseries (rare in the target
market) will only see the first one until an organisation switcher is
built. Flagged as a known limitation, not a blocker for launch.

**Job queue implementation: a Postgres-backed table (`story_jobs`), not an
external broker.** `claim_next_story_job()` uses `FOR UPDATE SKIP LOCKED`
for safe concurrent claiming. A scheduled HTTP hit to `/api/cron/worker`
(any host cron — Vercel Cron, GitHub Actions schedule, etc.) drains the
queue; server actions also call `runWorkerOnce` synchronously right after
creating a story so the demo/dev experience feels instant. This keeps
Phase 2B free of a new infra dependency; if generation volume grows
enough that polling latency matters, swap in Supabase's `pgmq` extension
or an external queue without changing the `ImageProvider` contract.

**Arabic content gating.** Every Arabic `story_theme_templates` row is
seeded with `native_review_status = 'draft'`. `assertTemplateUsable()`
(`src/lib/domain/templates.ts`) throws `TemplateNotReviewedError` for any
draft Arabic template, and this is enforced again in
`CreateStoryForm.tsx` (the UI simply doesn't offer draft templates as a
choice). English templates are authored directly by us, not translated,
so they ship as `reviewed` — the founder/team is the "native reviewer" for
English copy. **No Arabic template should be flipped to `reviewed` until
a native Arabic speaker has actually read it.** All seeded Arabic strings
are marked `[NEEDS NATIVE REVIEW]` inline in `supabase/seed/templates.json`
and in `src/messages/ar.json`.

**Arabic pronoun/gender handling.** Rather than a single pronoun token,
Arabic templates use a small fixed vocabulary of narrative verb-phrase
slots (`{v:felt_happy}`, `{v:said}`, etc. — see
`src/lib/domain/pronouns.ts`) each with `she`/`he`/`they` conjugations.
`they` defaults to masculine-plural agreement (the conventional MSA
default for a mixed/unspecified-gender group). This default, like all
Arabic copy, needs native review before it ships to a real family.

**Arabic PDF text shaping.** `pdf-lib`/`fontkit` do not perform Arabic
contextual shaping or bidi reordering. `src/lib/providers/pdf/arabic-shaping.ts`
pre-shapes text into Arabic Presentation Forms (`arabic-reshaper`) and
reorders it into left-to-right visual order (`bidi-js`) before handing it
to `drawText`. This is correct for a single paragraph; line-wrapping
currently re-uses one global reordering pass rather than re-shaping per
wrapped line, which is fine for the short (1-3 sentence) captions this
platform generates but should be verified against a physical print proof,
not just a PDF viewer, before any real print run.

**PDF font weights.** The three vendored fonts are variable fonts;
`pdf-lib` embeds a variable font at its default named instance, so "bold"
currently renders as the same weight as regular text. Source true static
Bold weight files before a production print run if bold text is needed
(see `assets/fonts/`).

**Private storage + signed URLs.** All story/child assets live in the
private `story-assets` Supabase Storage bucket (never public). Every URL
the browser sees is a short-lived (10 minute) signed URL generated
server-side per request — see `src/lib/domain/storage.ts` and the RLS
policies in `supabase/migrations/0007_storage.sql`, which additionally
restrict every object by the tenant-id path prefix so tenant isolation
holds for Storage exactly as it does for the database.

**Retention default: 730 days (24 months), configurable per tenant.**
`tenants.data_retention_days`. This is a reasonable operational default
inspired by common data-minimisation practice, not a PDPL compliance
claim — see `docs/NEEDS_FROM_ME.md` for the pending legal review.

**No photo personalisation at launch.** `FEATURE_PHOTO_PERSONALIZATION`
defaults to `off`. `isPhotoPersonalizationAllowed()`
(`src/lib/domain/consent.ts`) requires the flag AND tenant opt-in AND
completed legal review — all three, checked in one function, so no UI
path can accidentally request photo consent. The avatar system
(`src/lib/domain/avatar.ts`) is fully photo-free: hair/skin-tone/outfit
colour/accessory, rendered as a deterministic SVG, never an uploaded
image.

**Hard AI spend caps are enforced in the database, not just in
application code.** `can_spend()` / `record_ai_spend()`
(`supabase/migrations/0005_spend_caps_audit.sql`) flip a `kill_switch`
boolean the instant cumulative spend would exceed the configured cap, in
the same transaction as the spend record — there's no window where a
crash between "spent" and "recorded" could be exploited. The global kill
switch **defaults to `true` (blocked)**; the platform owner must
explicitly configure `monthly_cap_usd` and disable it. `RealImageProvider`
checks `can_spend()` before every paid call.

**Quota enforcement is in the database, not the UI.**
`consume_story_quota()` uses a row lock to atomically check-and-increment,
so two staff members generating stories at the same moment can't both
slip through when only one story's worth of quota remains.

**Billing prices shown as VAT-inclusive by default.**
`plans.vat_inclusive` defaults to `true`. Whether this is legally correct
depends on the buyer's Emirate/registration status — flagged for
`docs/NEEDS_FROM_ME.md`, never silently assumed on an invoice.

**Test database strategy.** Integration tests spin up a real, throwaway
PostgreSQL database (via the OS-installed `postgres` service, not Docker)
per test file, apply a minimal stand-in for Supabase's `auth` and
`storage` schemas (`supabase/testing/`), then run the actual migrations
and test against real RLS enforcement — not a mock. This is materially
stronger evidence of tenant isolation than testing against application
code alone. It does not exercise Supabase Auth's own token issuance,
Storage's actual file serving, or PostgREST's HTTP layer — those need a
real (or `supabase start` Docker-based) Supabase project before a
production launch; see `docs/TEST_CHECKLIST.md`.

## Not yet built (explicitly out of scope for this build session)

- Real image provider vendor integration (`RealImageProvider.callVendorApi`
  is a documented stub — needs a chosen vendor + API credentials).
- Stripe checkout/webhook HTTP wiring (schema and quota/spend architecture
  exist; the actual Stripe SDK calls do not — needs Stripe test-mode keys).
- Owner impersonation tooling with mandatory audit trail.
- MFA enrollment flow for platform owner accounts (schema field exists;
  enrollment UI does not).
- Native mobile apps, push notifications, print-fulfilment integration
  (Phase 4).
