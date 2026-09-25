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
English copy. Ideally no Arabic template is flipped to `reviewed` until a
native Arabic speaker has actually read it; as an interim step for the
first pilot, the 8 seeded Arabic templates were instead run through
Gemini with an explicit instruction to preserve every `{token}` verbatim
(script: a one-off pass, not part of the app) and flipped to `reviewed`
on that basis — this is a real quality improvement over raw machine
translation but is **not** a substitute for native review, and a native
speaker should still read them before wider rollout. `src/messages/ar.json`
UI strings are untouched by that pass and remain marked
`[NEEDS NATIVE REVIEW]` inline.

**Arabic pronoun/gender handling.** Rather than a single pronoun token,
Arabic templates use a small fixed vocabulary of narrative verb-phrase
slots (`{v:felt_happy}`, `{v:said}`, etc. — see
`src/lib/domain/pronouns.ts`) each with `she`/`he`/`they` conjugations.
`they` defaults to masculine-plural agreement (the conventional MSA
default for a mixed/unspecified-gender group). This default, like all
Arabic copy, needs native review before it ships to a real family.

**Arabic PDF text shaping.** `pdf-lib`/`fontkit` do not perform Arabic
contextual shaping. `src/lib/providers/pdf/arabic-shaping.ts` pre-shapes
text into Arabic Presentation Forms (`arabic-reshaper`) and reorders it
into left-to-right visual order (`bidi-js`) before handing it to
`drawText`. Two real bugs were found and fixed here during the first
pilot's real testing (both invisible in any automated test until a real
Arabic sentence with an embedded Latin name — a child's or organisation's
— needed to wrap onto more than one line). A third was found once #2's
fix (drawing each run separately) was in place:

1. Shaping/reordering ran ONCE on the whole paragraph, then lines were
   split by naive whitespace wrapping. Reordering is only valid as a
   per-rendered-line operation; doing it once for a multi-line paragraph
   is wrong the moment it wraps. Fixed in `render.ts`'s
   `wrapArabicParagraph`: wrap on the logical-order words first, shape/
   reorder only the finished line.
2. Separately, and worse: `pdf-lib`'s `CustomFontEmbedder.encodeText`
   calls fontkit's own `font.layout()` to turn a string into glyphs, and
   that call performs its OWN bidi pass on whatever it's given — on top
   of the reordering `shapeArabicForPdf` already did. A `drawText` call
   containing both Arabic and an embedded Latin run (e.g. "...Hala عند
   باب test...") came out with the Latin runs reversed ("alaH", "tset")
   even though `shapeArabicForPdf` had already placed them correctly —
   confirmed by rendering to an actual PDF and rasterising it with
   `pdftoppm`, not just inspecting the string in code. fontkit's bidi
   pass only has something to "fix" when a single `drawText` call mixes
   directions, so the fix is `splitIntoDirectionRuns` (arabic-shaping.ts):
   split a shaped line into same-script runs and draw each run as its
   own `drawText` call (`render.ts`'s `drawShapedLine`). Regression test:
   `tests/unit/arabic-shaping.test.ts` "splitIntoDirectionRuns".
3. Drawing runs separately means each run's start position depends on
   the PREVIOUS run's measured width being right — and
   `ARABIC_ADVANCE_WIDTH_FUDGE` (below #2's fix, this was 1.2, based on
   an earlier ~1.15x measurement) under-corrected badly enough that an
   Arabic run right before a Latin run (e.g. "...كوب الألوان بالخطأ في
   test...") visibly overlapped it — the next run started before the
   previous one's real ink had finished. Re-measured directly: rendered
   two sample runs to an actual PDF, rasterised with `pdftoppm`, and
   pixel-measured the real ink extent against pdf-lib's reported width
   — came out at 1.42x and 1.39x, not ~1.15x. Bumped the constant to
   1.45 (a little headroom above the measured ~1.4x). This is exactly
   the kind of defect that only shows up by rendering to a real page and
   looking at it, never by inspecting strings or running preflight
   (preflight has no notion of visual glyph position) — see
   `render.ts`'s `ARABIC_ADVANCE_WIDTH_FUDGE` comment for the exact
   pixel measurements.

Still verify against a physical print proof, not just a PDF viewer,
before any real print run.

**PDF font weights.** `src/lib/providers/pdf/fonts.ts` now embeds a
single static instance per font — `Inter-Regular-Static.ttf` (wght=400),
`Fraunces-Display-Static.ttf` (wght=600), `NotoNaskhArabic-Regular-
Static.ttf` (wght=400) — pre-generated from the vendored variable fonts
with `fonttools varLib.instancer` (see docs/LICENSES.md for the exact
commands; this was forced by a real rendering bug, not a style choice —
see "Bug fix: Arabic (and Latin) PDF text was silently not rendering"
below). There is currently no separate bold instance embedded, so "bold"
still renders as the same weight as regular text; if bold text is ever
needed, generate one more static instance at a higher `wght` value the
same way and embed it as a fourth `EmbeddedFonts` entry.

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

**Photo personalisation is implemented but stays off by default.**
`FEATURE_PHOTO_PERSONALIZATION` and
`PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE` both default to `off`. The
avatar system (`src/lib/domain/avatar.ts`) remains fully photo-free
(hair/skin-tone/outfit colour/accessory as a deterministic SVG) and is
always available regardless of these flags — photo upload is an
additional, separately-gated path on top of it, not a replacement. See
"Photo personalisation wiring" below for the actual upload/consent/
reference-image flow now built on top of this gate.

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

## Phase 3 additions

**8 story themes, not 6.** The brief's explicit list (healthy eating,
saving money, brushing teeth, welcoming a new sibling, first day at
school, honesty, hand-washing, National Day gratitude, financial
literacy) is now fully covered by adding "The Piggy Bank Promise"
(saving money / financial literacy, folded into one theme since they're
the same underlying value) and "Colours of Gratitude" (National Day).
Same en/ar + native-review-gating pattern as the original 6. A new
`tests/unit/seed-templates.test.ts` validates every theme/locale/pronoun
combination in `supabase/seed/templates.json` against the schema and
asserts no template ever leaves an unsubstituted `{token}` in rendered
output — this is what caught the need for several new Arabic verb-phrase
conjugations (`saved`, `counted`, `shared`, `sang`, `waved`, `celebrated`,
`felt_grateful` — see `src/lib/domain/pronouns.ts`).

**Billing stays in Stripe test mode by default, with a real, working
webhook pipeline.** `src/lib/billing/stripe.ts` refuses to initialise
with a live (`sk_live_`) secret key unless `STRIPE_MODE` is explicitly
set to something other than `"test"` — a deliberate extra gate beyond
just "don't set live keys," since a copy-pasted live key into a
misconfigured `.env` should not silently start charging real cards. The
checkout/portal/webhook routes (`src/app/api/billing/*`) are fully
implemented against the `stripe` SDK, not stubbed — they simply have no
effect until `FEATURE_BILLING=on` and real Stripe keys + price IDs exist.
Webhook idempotency (a Stripe requirement, since deliveries can be
retried) is enforced at the database level: every event id is inserted
into `stripe_webhook_events` (primary key) before any other write, so a
duplicate delivery hits a unique-violation and is treated as a no-op —
proven against a real Postgres unique-constraint in
`tests/integration/stripe-webhook-idempotency.test.ts`, including that
no RLS policy lets a client (not just the service role) write to that
table at all. Coupons are validated against our own `coupons` table
*before* Stripe is ever contacted, so an expired/exhausted/inactive code
never reaches Stripe.

**Stripe's newer API versions moved subscription billing-period fields
off the Subscription object onto each SubscriptionItem.** (Confirmed by
inspecting the installed `stripe` npm package's own type definitions,
since API version `2026-08-26.dahlia` is what that SDK version ships
pinned to.) `subscriptionFromStripe()` reads
`subscription.items.data[0].current_period_start/end` accordingly. We
only ever create single-item subscriptions (one plan per tenant), so the
first item's period is the subscription's period.

**Owner MFA is mandatory, not optional.** `checkOwnerMfaGate()`
(`src/lib/domain/mfa.ts`) uses Supabase Auth's built-in TOTP
factor + Authenticator Assurance Level (AAL) rather than a bespoke 2FA
scheme. `/owner` (and every future owner-only route) must call this gate
before rendering anything: no factor enrolled → redirect to
`/owner/mfa-enroll`; factor enrolled but not verified this session →
redirect to `/owner/mfa-challenge`; verified → proceed. This piggybacks
on Supabase's own well-tested TOTP implementation rather than us storing
or verifying secrets ourselves.

**Image safety checks fail CLOSED.** `UnconfiguredSafetyChecker`
(`src/lib/providers/image/safety.ts`) is the default safety checker for
`RealImageProvider` and marks every image unsafe until a real moderation
vendor is wired up via `IMAGE_SAFETY_PROVIDER=vendor`. This means real
(paid) image generation is blocked twice over right now: once by
`FEATURE_REAL_IMAGE_PROVIDER` being off, and independently by no safety
checker being configured — so turning on the feature flag alone can
never accidentally skip moderation. Spend is still recorded even when an
image is rejected by the safety check, since the vendor charged for the
generation attempt regardless of the outcome; the rejection is surfaced
as a normal (non-retryable) generation failure on that page, visible to
staff via `story_pages.last_error`.

## Dependency audit (Phase 5 hardening, partial)

Ran `npm audit` and applied everything fixable without a breaking change:
**`next-intl` was bumped 3.19 → 4.14.5** (compatible with the installed
Next.js 14.x / React 18.x per its own peer-dependency range), which
resolved its open-redirect and prototype-pollution advisories. Verified
with a full rebuild, the full test suite, and a runtime smoke test of
both `/en` and `/ar` against the production build (`next start`) —
correct `dir="ltr"`/`dir="rtl"`, correct brand strings, HTTP 200 on both.

**Not fixed, and why:** `npm audit fix --force` would upgrade `next`
14.2.15 → 16.3.5 to close the remaining Next.js advisories (several
high/critical: cache poisoning, SSRF via Middleware/rewrites, DoS in
Server Actions/Server Components, and others — see `npm audit` for the
full list with advisory links). This is a major-version jump spanning
Next 15 and 16, which changes fundamental, widely-used APIs in this
codebase — most concretely, `params`/`searchParams` in every page and
route handler become `Promise`-wrapped instead of plain objects, which
every one of the ~20 page components and route handlers in this repo
reads synchronously today (`params.locale`, `params.storyId`, etc.).
Applying that migration correctly across every affected file, plus
whatever else changed in two major versions, is real, substantial work
that needs to be done deliberately and regression-tested against a live
Supabase project (which did not exist during this build session) — not
forced through blind in the same session as unrelated feature work.
**This is tracked as a required Phase 5 task before a production
launch, not silently dropped** — see `docs/NEEDS_FROM_ME.md` and
`docs/en/launch-runbook.md`'s pre-launch checklist.

A handful of the remaining advisories (`esbuild`, `@vitest/mocker`, via
`vitest`) are **dev/test-tooling only** — `vitest` and its transitive
`esbuild`/`vite` dependencies never ship to production, so their risk is
scoped to a developer's local machine while running tests, not to any
deployed environment. Upgrading to `vitest@5` would close these but
requires Node ^22.12 (already satisfied here) and a `@types/node` major
bump; left for the same dedicated hardening pass as the Next.js upgrade
rather than mixed into this session's feature work.

## Rate limiting

**Decision: a real, working in-memory limiter by default, with a
distributed Upstash-Redis-backed limiter that activates automatically
once `RATE_LIMIT_REDIS_URL`/`RATE_LIMIT_REDIS_TOKEN` are configured.**
`src/lib/rate-limit.ts`. The in-memory limiter is correct for a single
server process (local dev, a demo, or a single-instance deployment) but
under-counts across multiple instances (each has its own counters) —
that's fine for now and clearly commented, with the Upstash path built
(using Upstash's plain HTTPS REST API, no extra SDK dependency) as the
real answer once a multi-instance deployment exists. Applied to sign-up,
sign-in (keyed by IP+email so a shared NAT can't lock out every
account), and the public consent lookup/response endpoints (keyed by IP;
generous limits since a 192-bit random consent token is already
computationally infeasible to brute force — this is defence-in-depth,
not the primary protection there).

## E2E test scope

**Decision: the first Playwright E2E suite covers only pages that render
without a live Supabase project** (marketing home, sign-in/sign-up form
rendering, locale/RTL/LTR switching, PWA manifest, skip-link) —
`tests/e2e/*.spec.ts`, run in CI against a real headless Chromium. Every
flow that needs actual auth/data (sign up → create tenant → add a child →
consent → generate → approve → PDF) requires a real or `supabase start`
-based Supabase project to exercise honestly; building it against nothing
would mean either mocking Supabase at the network layer (testing the
mock, not the app) or leaving it permanently red in CI. Tracked as
follow-up work for once a Supabase project exists (`docs/NEEDS_FROM_ME.md`
item 1) rather than faked now.

## Security review finding (fixed)

A manual security review of this branch caught a real correctness bug
before it ever reached a live project: `story_jobs` had only a SELECT
RLS policy, but both `createStory()` and `regeneratePageAction` insert
into it using the regular authenticated (RLS-scoped) client, not the
service role. Against real RLS enforcement, **every story creation and
every page regeneration would have failed outright** with a row-level
security violation. Confirmed with a failing integration test against a
real Postgres instance (proving the bug), then fixed by adding a
correctly-scoped `story_jobs_insert_via_story` policy — a tenant member
may enqueue a job for their own story, but (as intended) still cannot
update a job directly; only the service-role worker claims/processes
them. The regression test is now permanent:
`tests/integration/story-jobs-rls.test.ts`. This is exactly the class of
bug the "test against real RLS, not mocks" strategy
(`docs/DECISIONS.md` "Test database strategy") exists to catch — and did.

## Phase 4: families are tenants

**Decision: an individual/family account is a `tenants` row with
`tenant_type = 'family'`, not a separate consumer data model.** A family
reuses the exact same tenant_members/RLS/children/story/quota machinery
a nursery uses — `create_family_tenant()` mirrors `create_tenant()`
(`supabase/migrations/0009_family_and_gifts.sql`), and the sole member
holds the existing `nursery_owner` role (a naming artifact of Phase 2;
in this context it just means "account owner"). This was the strongest
practical option because: every isolation guarantee already proven for
nurseries (RLS, storage scoping, deletion cascade, quota enforcement)
applies to families for free, with zero new attack surface to test from
scratch; and it avoids a second, parallel authorization model that would
need its own RLS policies, its own tests, and its own bugs.

**Decision: a family tenant's own consent workflow is auto-granted, not
skipped.** A `BEFORE INSERT` trigger on `children`
(`auto_grant_family_consent`) sets `consent_status = 'granted'`
immediately when the owning tenant is `tenant_type = 'family'` — the
person adding the child under their own family account IS the guardian,
so the nursery's multi-party "ask a parent, wait for a click" flow does
not apply. This keeps the *rule* ("no story without consent") fully
intact — `createStory()` still checks `consent_status = 'granted'`
identically for both tenant types — while removing a workflow step that
would be actively confusing for a parent creating a story for their own
child. Nursery-tenant children are completely unaffected (the trigger is
a no-op for `tenant_type = 'nursery'`) — proven in
`tests/integration/family-tenants.test.ts`.

**Decision: nav/UI adapts per tenant type rather than shipping a second
dashboard.** `DashboardNav` hides the Staff link for family tenants
(`nurseryOnly` link flag) and the child detail page shows a short
explanatory note instead of the consent-request panel — small,
targeted conditionals rather than forking the whole dashboard, since
~95% of the UI (children, avatars, stories, reader, PDF, settings) is
identical for both audiences.

## Phase 4: gifting

**Decision: a gift is a purchased pack of story credits, redeemed via a
code, fulfilled through the existing `quotas` table.** Modelled
deliberately like a physical gift card: the purchaser does not need the
recipient to have an account yet, and the recipient does not need to be
pre-invited anywhere — they just need the code. `redeem_gift()` credits
`quotas.stories_included_this_period` for whichever tenant the redeemer
is a member of, atomically and idempotently (a gift can only ever be
consumed once — proven with a double-redeem test in
`tests/integration/gift-redemption.test.ts`).

**Decision: gift codes follow the exact same trust model as consent
tokens** (`docs/DECISIONS.md` "Private storage + signed URLs" territory,
extended here): a random code is generated once, only its SHA-256 hash
is ever persisted (`gifts.code_hash`), and the raw code is delivered to
the purchaser by embedding it directly in the Stripe `success_url` —
never stored in plaintext anywhere, never emailed (no email-sending
infrastructure exists in this build — see `docs/NEEDS_FROM_ME.md`). The
purchaser is shown the code/link on the success page and is responsible
for sharing it themselves for now.

**Decision: gift purchases use Stripe Checkout in one-time `payment`
mode with ad-hoc `price_data`, not a pre-created Stripe Price.** Unlike
subscription plans (which need a real Stripe Price object per
plan/interval, configured once a Stripe account exists), a gift's price
is simple and fixed enough that generating the line item inline at
checkout-creation time (`src/app/api/gifts/checkout/route.ts`) avoids a
manual Stripe-dashboard setup step for something this simple. Reuses the
exact same webhook route, signature verification, and idempotency
guarantee already built for subscriptions
(`src/app/api/billing/webhook/route.ts` now branches on
`session.mode`/`metadata.purpose` before deciding which flow to run).

## Real image generation: Google Gemini

**Decision: Google Gemini (`gemini-2.5-flash-image`, "nano banana") is the
chosen real image vendor**, implemented as `GeminiImageProvider extends
RealImageProvider` (`src/lib/providers/image/GeminiImageProvider.ts`),
selected by `createImageProvider()`
(`src/lib/providers/image/factory.ts`) whenever
`FEATURE_REAL_IMAGE_PROVIDER` is on and `GEMINI_API_KEY` is set — it
throws loudly rather than silently falling back to the mock provider if
the flag is on but the key is missing. This slots into the existing
spend-cap / safety-checker pipeline in `RealImageProvider.generate()`
unchanged; `GeminiImageProvider` only implements `callVendorApi()`.

**Decision: Gemini generates illustration art only — it never renders
story text into the image.** `buildIllustrationPrompt()`
(`src/lib/providers/image/prompts.ts`) explicitly instructs "no text,
letters, words, or writing anywhere in the image." All story text (the
caption banners, the repeating title banner) is drawn by the platform's
own already-tested Arabic-shaping PDF pipeline
(`src/lib/providers/pdf/arabic-shaping.ts` +
`src/lib/providers/pdf/render.ts`), not by the model. This was a
deliberate trade-off against the founder's original manual workflow
(which asked Gemini to bake Arabic text directly into the image via
Nano Banana): an AI image model is not a reliable typesetter — it can
mis-shape Arabic letterforms, misplace tashkeel, or misspell words, and
none of that is checkable/fixable after the fact the way our own
PDF-text rendering is. Illustration-only generation plus our own text
overlay keeps every word in the final book exactly what was typed in,
in a correctly-shaped, correctly-positioned font.

**Decision: character consistency across a story's pages uses two
reference images, not one.** `generatePageImage()`
(`src/lib/jobs/worker.ts`) passes both the child's uploaded reference
photo (if photo personalisation is active for that child — see below)
and the earliest already-generated page's image bytes to Gemini as
`inlineData` reference parts alongside the prompt. The already-generated
page matters even when a photo exists, since it lets the *illustrated*
character (not just the photo) stay visually consistent page to page;
when no photo exists, it's the only reference available and is what
keeps a child's invented storybook character looking the same
throughout.

## Photo personalisation wiring

**Decision: uploading a photo requires all of feature flag + legal-review
flag + tenant opt-in + a granted consent request whose scope explicitly
covers photo use — enforced again at upload time, not just at
consent-request time.** `uploadChildPhotoAction`
(`src/lib/actions/children.ts`) checks all four independently rather
than trusting that a UI path already gated them, since the two are
separate requests at separate times (a nursery could request "story
only" consent, then later the family/legal posture could change).
`buildConsentScope()` (`src/lib/domain/consent.ts`) computes whether a
consent request even offers the photo checkbox based on the same tenant
opt-in + legal-review conditions, so a parent is never asked to consent
to something the deployment isn't actually configured to use.

**Decision: the photo lives on `children.photo_asset_path`, in the same
private `story-assets` bucket as everything else**, not a separate
table/bucket — it's just one more tenant-scoped asset path, so it
inherits the exact same signed-URL access pattern
(`src/lib/domain/storage.ts`) and the exact same cascade-delete handling
(`deleteChildCascade` in `src/lib/domain/deletion.ts`) as story PDFs and
page images. `deleteChildPhoto()` is a separate, smaller function
(rather than folded into `deleteStoryAssetsForChild`) because photo
consent and story consent are tracked as distinct scope flags and can be
withdrawn independently in principle, even though `withdrawConsentAction`
currently withdraws both together.

## PDF banner-style layout

**Decision: story pages moved from "image on top, caption text below" to
full-bleed illustration with a scalloped caption band overlay** at the
bottom edge, implemented in `src/lib/providers/pdf/render.ts` using shape
primitives in `src/lib/providers/pdf/banners.ts`. This was done to match
a real sample PDF output the founder supplied and asked the platform to
resemble.

**Decision: no cover page, no dedication page, no repeating title
banner.** The original version of this layout also generated a cover
page (title + child name), a dedication page ("This story was created
especially for ... by ..."), and a title banner repeating the English
theme name at the top of every single illustrated page. Removed all
three per real pilot feedback ("first 2 pages is very poor & not
needed", "writing first day at school not needed... every single page")
— they read as filler rather than part of the story. `drawFreeFloating
Banner` in banners.ts is now unused by render.ts (kept for the caption
band's flat-bottom variant, `drawFlatBottomBanner`) but left in place in
case a cover treatment comes back later. `renderStoryPdf`'s page count
is now exactly `pages.length`, not `2 + pages.length` — `story-pdf.ts`
and `preflight.ts` were both updated to match.

**Decision: the scalloped/cloud edges are drawn as rows of overlapping
same-colour circles, not custom SVG bezier/arc paths.** `pdf-lib` does
support arbitrary paths via `drawSvgPath`, but adjacent same-colour
filled shapes with no border already read as one continuous wavy edge
with no visible seams, which is far simpler to get right than hand-built
arc geometry and produces the same visual result. See
`drawFreeFloatingBanner` (title banner: scalloped top *and* bottom, with
rounded end caps — a free-floating "sticker") and `drawFlatBottomBanner`
(caption band: scalloped top only, flat sides and bottom, flush to the
page edge) in `banners.ts`.

**Decision: both banners size themselves dynamically from the actual
wrapped line count of their text**, rather than using a fixed height.
Story titles include the child's name and captions come from
AI-generated content, so neither has a bounded length in practice; a
fixed-height banner would either clip text or leave awkward empty space
depending on what a given story happened to contain.

## Bulk export folder structure

**Decision: one whole-tenant export (`/api/stories/export-zip`), not one
per class.** The class-picker links this replaced required knowing which
classes existed and downloading each separately; a nursery admin wants
one click for everything. `src/app/[locale]/(dashboard)/dashboard/stories/page.tsx`
now shows a single "Download all stories (ZIP)" link whenever the tenant
has at least one approved story, instead of a row of per-class buttons.

**Decision: `{class}/{child}.pdf` when a child has exactly one approved
story, `{class}/{child}/{theme}-{shortId}.pdf` per story when they have
several.** A flat `{class}/{child}.pdf` for every child would silently
collide (ZIP entries with the same name) the moment any child has more
than one approved story — this only starts happening for real once
repeat/regenerated stories are common — so multi-story children get
their own subfolder instead, while a single-story child stays a flat
file rather than a needless one-file folder. Children with no
`class_name` land in a `No class` folder rather than being dropped.
Logic lives in `buildExportPlan` (`src/lib/providers/pdf/bulk-zip.ts`),
kept as a pure function specifically so it's unit-testable without a
database or PDF rendering — see `tests/unit/bulk-zip.test.ts`.

## Bug fix: Arabic (and Latin) PDF text was silently not rendering

**This was a real, previously undetected defect in code from before this
session, not something introduced by the banner-layout work above** —
found only because implementing the banner layout finally motivated
actually opening a generated PDF in a real viewer and looking at it,
which nothing in the test suite ever did (`runPreflight` only regex-
validates the *source* strings passed in, never anything from the
rendered PDF itself; the existing PDF integration tests only assert
`pdfBytes.length > 0` and preflight-level structural checks). Every
Arabic PDF the platform had ever generated — cover, dedication, and
story pages alike — would have opened to a nearly-blank page in a real
reader.

**Root cause: embedding the raw variable fonts (`subset: true`, at
fontkit's "default named instance") corrupted glyph rendering.**
Confirmed by rendering output PDFs through two independent engines
(MuPDF via PyMuPDF, and Chromium's PDFium) — both showed almost every
glyph missing, for both the Arabic (Noto Naskh Arabic) and Latin (Inter,
Fraunces) embedded fonts. Turning `subset` off fixed it; going further,
pre-instantiating a single static weight/width/optical-size from each
variable font with `fonttools varLib.instancer` (see docs/LICENSES.md
for the exact commands and the resulting `*-Static.ttf` files now in
`assets/fonts/`) and embedding *those*, still unsubset, is what
`src/lib/providers/pdf/fonts.ts` does today. The ~1–1.5MB added per PDF
from not subsetting is negligible next to the embedded illustration
images.

**Second, smaller bug found during the same verification: `PDFFont.
widthOfTextAtSize` measures shaped Arabic text roughly 15% narrower than
these fonts actually render**, causing wrapped lines to sit right at (and
occasionally past) the page edge with no visible margin — while the
identical measurement for Latin text matched the real render exactly.
Root cause not fully pinned down; `ARABIC_ADVANCE_WIDTH_FUDGE = 1.2` in
`src/lib/providers/pdf/render.ts` is a deliberate, documented safety
margin applied to both line-wrapping and horizontal centering for Arabic
text specifically, verified against both engines after the fix. If this
ever needs revisiting (e.g. after a pdf-lib upgrade), the reproduction
recipe is: render a known long Arabic string through `renderStoryPdf`,
open the PDF in PDFium or MuPDF, and compare the actual glyph bounding
box width to `font.widthOfTextAtSize()`'s reported value.

**Lesson for future PDF/font changes: always visually verify output in a
real PDF viewer, not just structurally.** Added as a note to
`docs/TEST_CHECKLIST.md` — none of the 146 automated tests would have
caught either bug above, and both were only found by actually opening a
rendered PDF.

## Not yet built (explicitly out of scope for this build session)

- Vendor moderation integration for image safety checks
  (`VendorModerationSafetyChecker` — needs a chosen moderation vendor;
  `RealImageProvider`'s safety-check hook point exists and Gemini image
  generation itself is wired up, see "Real image generation: Google
  Gemini" above).
- Actual Stripe test-mode keys, price IDs, and coupon records — the
  checkout/portal/webhook code is fully implemented (see "Phase 3
  additions" above) but has never made a real network call to Stripe
  since no account exists yet.
- Owner impersonation tooling with mandatory audit trail.
- Email delivery (gift codes are shown on-screen/in-URL only, not
  emailed — no transactional email provider is configured; see
  "Phase 4: gifting" above and `docs/NEEDS_FROM_ME.md`).
- Native mobile apps, push notifications, print-fulfilment integration
  (still genuinely Phase 4 territory — family accounts and gifting,
  the web-buildable parts of Phase 4, are now scaffolded; these three
  need a native app project, push credentials (APNs/FCM), and a print
  vendor contract respectively, none of which exist yet).
