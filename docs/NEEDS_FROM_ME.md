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

4. **Choose an image generation vendor** (e.g. an AI image API) and
   provide API credentials. The code is architected so this is a
   contained change (`RealImageProvider.callVendorApi` in
   `src/lib/providers/image/RealImageProvider.ts`), but the actual vendor
   choice, contract, and API key are a commercial decision + credential
   only you can provide.

5. **Set a real monthly AI spend cap** once you have pricing from that
   vendor. Right now the global kill switch defaults to **on** (blocked)
   specifically so nothing can spend money until you set
   `global_spend_cap.monthly_cap_usd` intentionally.

## Before enabling billing

6. **A Stripe account** (test mode to start — nothing here should ever
   go live without your explicit say-so). I need the publishable/secret
   test keys. The plans/pricing/quota architecture is built; the actual
   Stripe SDK checkout + webhook calls are the next step once there's an
   account to point them at.

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

## Physical / one-time actions

10. **A print proof of at least one Arabic and one English PDF** from an
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
