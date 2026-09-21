# Pilot plan

A practical plan for running the first real pilot with a nursery,
proving the product works for an actual customer before committing to
paid AI generation or a sales push.

## Goal

Prove three things with one real nursery, over 2-4 weeks:
1. Staff can actually use the product without hand-holding (sign up,
   add children, get consent, create and approve stories).
2. Parents actually respond to the consent request and are happy with
   what their child receives.
3. The product creates enough of a "wow" moment that the nursery would
   pay for it (even if you don't charge them yet).

## Why run it on the mock image provider

The pilot does not need real AI illustrations to prove the above. The
mock provider produces a placeholder illustration per page instantly and
for free — everything else (personalisation, the child's name and avatar
appearing correctly, the approval workflow, the reader, the printed PDF)
is real and works identically to how it will with real AI images later.
Running the pilot this way means:
- Zero AI cost risk during the pilot.
- No dependency on choosing/contracting an image vendor before you've
  even validated the concept with a real customer.
- A clean, honest story to tell the pilot nursery: "here's exactly what
  it does today; the illustrations you're seeing are placeholders and
  the real ones will look like [reference examples/mockups]."

Be upfront about this placeholder status with the pilot nursery — see
"What to tell the pilot nursery" below.

## Choosing the pilot nursery

Look for:
- A nursery you already have a warm relationship with, or an easy
  introduction to.
- A director/owner who is comfortable being an early adopter and giving
  candid feedback (not just being polite).
- A reasonable number of children in one class (10-30) — enough to
  stress-test CSV import and bulk operations, not so many that a rough
  edge blocks the whole pilot.
- Ideally, a mix of Arabic- and English-speaking families, so both
  language paths get exercised — but note that Arabic story content
  still needs native review before real families see it (see
  `docs/NEEDS_FROM_ME.md` item 9); if that review isn't done yet, run
  the pilot in English only, or get the review done first for at least
  one theme.

## Timeline (suggested)

| Week | Activity |
|---|---|
| 0 | Deploy per `docs/en/launch-runbook.md`. Create the pilot nursery's account yourself, or walk the director through sign-up live. |
| 1 | Nursery admin adds/imports their class, configures avatars, sends consent requests to parents. You're on standby for questions. |
| 1-2 | As consent comes in, staff generate and approve stories for a chosen theme. Collect screenshots/PDFs as you go. |
| 2 | Deliver at least one printed/PDF story to a parent. Ask for reaction — ideally in writing (a quick WhatsApp message or email is fine, doesn't need to be formal). |
| 3-4 | Debrief with the nursery director: what worked, what was confusing, would they pay, what price feels right, what theme resonated most. |

## What to tell the pilot nursery

Be specific and honest:
- "The illustrations right now are simple placeholders, not the final
  AI-generated art — we wanted you to experience the personalisation and
  workflow first."
- "A parent's consent is required before any story is created, and they
  can withdraw it at any time, which deletes the story."
- "This is a pilot — we're actively building based on what you tell us."

## What to measure

Keep it simple — a shared note or spreadsheet is enough:
- Time from "admin opens the app for the first time" to "first child
  added."
- Number of consent requests sent vs. granted (and how long it took
  parents to respond).
- Number of stories created vs. approved without changes vs. rejected/
  regenerated (rejections/regenerations tell you where the theme content
  itself needs work).
- Any moment staff got stuck or asked "how do I...?" — each one is a UX
  fix or a piece of documentation you're missing.
- The director's honest answer to: "if this cost AED X/month, would you
  subscribe?" — ask this explicitly, don't just infer it.

## Exit criteria

Move from pilot to a real paid launch when:
- At least one full cycle (add child → consent → generate → approve →
  deliver) completed without a staff member needing you to intervene.
- The nursery director gives an affirmative answer on willingness to
  pay, even informally.
- No unresolved data-handling concern from the director or from your own
  legal review.

If any of these isn't true yet, that's not failure — it's exactly what
a pilot is for. Fix the specific gap and consider a second pilot cycle
before a wider launch.
