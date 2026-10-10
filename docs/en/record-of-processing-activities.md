# Record of Processing Activities (ROPA) — engineering posture, PENDING LEGAL REVIEW

A Record of Processing Activities is standard practice under both UAE
PDPL and GDPR Article 30 — a structured inventory of what personal data
is processed, why, by whom, and where it goes. This is Ownly's, built
directly from the live schema and architecture, not a generic template.
It is **not** a legal compliance statement — see `docs/NEEDS_FROM_ME.md`.

## 1. Controller

Ownly, operated by [legal entity name to confirm — Meydan Free Zone
FZE/FZ-LLC, trade license pending incorporation], Dubai, UAE.

## 2. Processing activities

| # | Activity | Data subjects | Personal data | Purpose | Legal basis (PDPL) | Recipients | Retention | Cross-border? |
|---|---|---|---|---|---|---|---|---|
| 1 | Account creation & authentication | Nursery staff, parents/guardians | Name, email or phone, password hash | Operate the account | Contract | Supabase (auth) | Life of account + 30 days post-deletion | Yes — Supabase ap-southeast-1 (Singapore) |
| 2 | Child profile (default) | Children | First name, pronoun, class/group, language, avatar config | Generate a personalised story | Consent (parent/guardian) | Supabase (database) | Configurable, 730 days default | Yes — Supabase ap-southeast-1 |
| 3 | Photo-based personalisation (optional) | Children | Reference photo | Generate a photo-likeness illustration | Explicit, specific consent, separately scoped from story consent | Google (Gemini API, paid tier) | Transient — not persisted by the AI provider beyond the request; Storage copy follows row 2's retention | Yes — Supabase ap-southeast-1 AND Google Gemini API (processing location not fully confirmed — flagged for counsel) |
| 4 | Consent & identity verification | Parents/guardians | Phone number (photo-scoped requests only), consent timestamp, OTP verification timestamp | Prove consent was given by the person holding the phone on file | Necessary to establish consent itself | Supabase (database); phone OTP via Supabase Auth (Twilio as SMS sub-processor) | Life of the consent record | Yes — Supabase ap-southeast-1 |
| 5 | Payment processing (subscriptions) | Nursery owners, family account holders | Name, email, payment method (tokenised, never touches Ownly's own servers) | Billing | Contract | Stripe | Per Stripe's own retention policy, outside Ownly's control | Yes — Stripe (international) |
| 6 | Payment processing (printed storybook orders) | Family/nursery customers | Name, phone, delivery address, payment method | One-off purchase fulfilment | Contract | Stripe; print/logistics partner (once contracted, bound by `contracts/DPA_Schedule.md`) | Order lifecycle + print/logistics partner's own DPA-bound retention (max 90 days post-delivery by current template default) | Yes — Stripe; print/logistics partner once contracted |
| 7 | SMS login/verification codes | Nursery staff, parents/guardians | Phone number | Deliver a one-time passcode | Contract / consent (same basis as the activity it supports) | Twilio (via Supabase Auth) | Not retained beyond the verification window | Yes — Twilio (international) |
| 8 | Transactional email | Account holders | Email address | Account notifications | Contract | Resend | Not retained beyond delivery | Yes — Resend (international) |
| 9 | Audit logging | Staff/owner actions (not data subjects directly) | Action type, actor ID, target ID, non-identifying counts — no personal data content | Accountability, dispute resolution | Legitimate interest (accountability) | Supabase (database) | Same as the account/action it logs | Yes — Supabase ap-southeast-1 |

## 3. Sub-processors (summary — see Privacy Policy for the customer-facing version)

Supabase (database/auth/storage, Singapore) · Vercel (application hosting,
global edge) · Google (Gemini API, illustration generation, paid tier) ·
Stripe (payments) · Twilio (SMS) · Resend (email) · print/logistics
partner (once contracted, row 6 above only).

## 4. What this record does not yet resolve

- **Row 3's exact Gemini processing location** — Google's API documentation
  does not commit to a single fixed region the way Supabase does; this is
  flagged for counsel alongside DPIA gap #1.
- **A signed DPA with Supabase and with Google** — both vendors offer
  their own standard Data Processing Addendum for customers (Supabase's
  via its dashboard/legal terms, Google's via Google Cloud's standard
  terms for API customers). Requesting and accepting these is a real,
  concrete action available today, independent of the broader "is
  consent alone sufficient" legal question in the DPIA — it strengthens
  the position regardless of how that question is ultimately answered.
  Not yet done; added to `docs/NEEDS_FROM_ME.md`.
- **Whether this record itself satisfies PDPL's own documentation
  expectations** (PDPL doesn't mandate a ROPA by that name the way GDPR
  Art. 30 does) — counsel to confirm during the broader DPIA review.
