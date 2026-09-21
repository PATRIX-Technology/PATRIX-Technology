# What I need from you

Everything in this file is something I genuinely cannot do myself —
either because it requires an account only you can create, a payment
method, a legal/commercial decision, or a physical action. Everything
else has already been built and is documented in `docs/HANDOFF.md`.

## To go from "runs on a laptop" to "a real nursery can use it"

1. **Create a Supabase project** (free tier is fine to start) at
   https://supabase.com. I need:
   - Project URL and anon key → `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Service role key (keep this secret — never share it in chat/email) →
     `SUPABASE_SERVICE_ROLE_KEY`
   - Once created, tell me and I will run the migrations in
     `supabase/migrations/` against it and seed the story templates.

2. **Choose and confirm the brand name.** "Hikayti" is a working name only
   (see `docs/DECISIONS.md`). Before it appears on anything public, it
   needs: a basic UAE/GCC trademark screening, and confirmation the
   matching domain (e.g. `hikayti.com` / `.ae`) is available. I cannot
   register a domain or file a trademark — that needs your payment method
   and identity.

3. **A domain name and hosting decision.** I'd recommend Vercel (built
   for Next.js) or a similar host — but creating that account and
   connecting billing is yours to do.

## Before enabling real (paid) AI image generation

4. **Provide a Gemini API key.** Google Gemini is now the wired-up image
   vendor (`GeminiImageProvider` — see `docs/DECISIONS.md` "Real image
   generation: Google Gemini"), so the vendor choice itself is already
   made; what's left is: get an API key from
   https://aistudio.google.com (you mentioned you already have a Pro
   subscription — that's what you'll use to generate it), give it to me
   so I can set it as `GEMINI_API_KEY`, and confirm the per-image cost
   you're seeing so I can set `GEMINI_COST_PER_IMAGE_USD` accurately
   (defaults to $0.02/image, which is an estimate, not your actual
   billed rate). I'll also need you to flip
   `FEATURE_REAL_IMAGE_PROVIDER` to `on` once you're ready to stop using
   the free mock illustrations.
4a. **Choose a content moderation approach** for generated images —
   Gemini has some built-in safety filtering, but
   `VendorModerationSafetyChecker` (`src/lib/providers/image/safety.ts`)
   is still an unconfigured stub for an independent check. Until this is
   configured, every real-generated image is blocked by default (fails
   closed) — see `docs/DECISIONS.md` "Image safety checks fail closed".

5. **Confirm your monthly AI spend cap.** You told me $500/month is fine
   — that's a safety switch in the database, not a bill I can generate on
   your behalf (see `docs/DECISIONS.md` for how `global_spend_cap` works).
   Right now it defaults to **on** (blocked) specifically so nothing can
   spend money until it's set intentionally; once I have your Supabase
   project (item 1 above), I'll set `global_spend_cap.monthly_cap_usd` to
   500 for you — just confirming here in writing since it's real money.

## Before enabling photo-based personalisation (optional)

5a. **A qualified legal review of photo-based personalisation**, covering
   at minimum: UAE/GCC child-data and biometric-adjacent data handling,
   what the consent flow needs to say to parents, and how long an
   uploaded photo should be retained. The code is fully built and
   gated behind this — `FEATURE_PHOTO_PERSONALIZATION` and
   `PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE` both default to `off`,
   and a nursery also has to explicitly opt in per-tenant — but nobody
   should be able to upload a child's photo until this review is done.
   See `docs/DECISIONS.md` "Photo personalisation wiring".

## Before enabling billing

6. **A Stripe account** (test mode to start — nothing here should ever
   go live without your explicit say-so). I need:
   - Publishable + secret **test** keys → `STRIPE_PUBLISHABLE_KEY`,
     `STRIPE_SECRET_KEY`
   - A webhook endpoint configured in the Stripe dashboard pointing at
     `<your-app-url>/api/billing/webhook`, and its signing secret →
     `STRIPE_WEBHOOK_SECRET`
   - Price objects created in Stripe for each plan (Starter/Growth/
     Network, monthly + annual), with their IDs added to the `plans`
     table (`stripe_price_id_monthly` / `stripe_price_id_annual`)

   The checkout session creation, customer portal redirect, and webhook
   handler (with signature verification and idempotency) are fully
   implemented and unit/integration tested — see `docs/DECISIONS.md`
   "Phase 3 additions". Set `FEATURE_BILLING=on` once the above exists;
   until then the billing section on the settings page, and the gift
   purchase page (`/gift`, Phase 4), both stay hidden behind the same
   flag.

## Before family accounts / gifting feel complete (Phase 4)

6a. **A transactional email provider** (Resend, Postmark, SendGrid, or
   Supabase's own SMTP integration) if you want gift codes emailed to
   the purchaser automatically. Right now the redemption code is shown
   on-screen and in a shareable link after payment — real and working,
   just manual: the purchaser has to copy and send it themselves. This
   is a contained addition once you've picked a provider and I have an
   API key for it.

## Legal / compliance (do not treat any of this as done)

7. **A lawyer's review of the UAE PDPL posture.** I've designed for
   data-minimisation, tenant isolation, signed URLs, consent tracking,
   and configurable retention — all *engineering* best practice — but I
   am not a lawyer and none of this constitutes legal compliance advice.
   Anything marked `PENDING LEGAL REVIEW` in this repo needs a real
   review before you rely on it commercially, especially given this
   product handles children's data.
8. **Confirmation of VAT treatment** for the displayed plan prices
   (`plans.vat_inclusive`) — this depends on your business registration
   and is a decision for your accountant, not me.
9. **A native Arabic speaker to review every Arabic template and UI
   string.** I wrote reasonable Modern Standard Arabic, but every string
   is marked `[NEEDS NATIVE REVIEW]` on purpose — see
   `docs/DECISIONS.md` "Arabic content gating". The system will not let
   a real family receive a story generated from an unreviewed Arabic
   template; the owner dashboard (`/owner`) shows exactly which templates
   are still pending.

## Not a decision I need from you, but you should know about it

10. **A Next.js major-version upgrade (14 → 16) is required to close
    several high/critical dependency vulnerabilities** (cache poisoning,
    SSRF, DoS — see `docs/DECISIONS.md` "Dependency audit"). This isn't
    something I need a decision on — it's engineering work I couldn't
    safely rush through in the same session as feature work, since it
    touches how almost every page in the app reads its URL parameters
    and needs a real regression test against a live Supabase project.
    Flagging it here so it's on your radar before you commit to a launch
    date: budget a dedicated session for this, ideally right after a
    Supabase project exists (item 1) so it can be tested against the
    real thing.

## Physical / one-time actions

11. **A print proof of at least one Arabic and one English PDF** from an
    actual print vendor before promising print-ready output to a
    customer. The PDF architecture (A5, 3mm bleed, 300 DPI target,
    embedded fonts, preflight validation) is built and automatically
    tested, but a physical proof is the only way to catch anything a
    screen can't show you (see `docs/DECISIONS.md` "Arabic PDF text
    shaping" for the one known nuance to check first).

---

Nothing above blocks the rest of the product from working. Everything
that doesn't need one of these has been built and can be demoed today
with `npm run dev` using the mock image provider and a local/demo
Supabase project — see `docs/HANDOFF.md`.
