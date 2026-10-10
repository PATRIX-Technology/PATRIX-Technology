# Data breach notification procedure (engineering posture — PENDING LEGAL REVIEW)

This document describes the operational procedure Ownly follows if a data
breach is suspected or confirmed. It is **not** a legal compliance
statement and has not been reviewed by a UAE-qualified lawyer — see
`docs/NEEDS_FROM_ME.md`. It exists so there is a real, followable process
rather than nothing, and to give counsel something concrete to review
rather than a blank page.

## What counts as a breach

Any confirmed or reasonably suspected: unauthorised access to, loss of,
alteration of, or disclosure of personal data Ownly holds — a child's
name or photo, a parent/guardian's contact details, or a shipping
address shared with a print/logistics partner. This includes a breach
at a sub-processor (Supabase, Google, Stripe, Twilio, Resend, or a
print/logistics partner) that exposes Ownly customer data, not only a
breach of Ownly's own systems.

## Detection

- Automated: Supabase project alerts, Vercel error monitoring, and the
  `audit_logs` table (records child deletion and consent withdrawal
  events) are the primary signals available today. There is no
  dedicated security information and event management (SIEM) tool in
  place — this is a known gap for a company this size, not a hidden one.
- Manual: a report from a sub-processor, a customer, a security
  researcher, or a team member.

## Immediate steps (within hours of detection)

1. **Contain.** Revoke the specific credential, API key, or access path
   involved. Do not delete logs or evidence.
2. **Assess scope.** Which table(s)/records are affected, how many data
   subjects, whether children's data specifically is involved (treated
   as higher severity by default).
3. **Record.** Start a written incident log (timestamp, what is known,
   what action was taken) from the first hour — this becomes the record
   referenced in any later notification.

## Notification timeline

- **To the Controller's own management (the founder):** immediately on
  detection.
- **To affected individuals and the relevant UAE data protection
  authority, where required by law:** without undue delay. UAE PDPL does
  not specify a fixed hour count the way GDPR's 72 hours does, so the
  exact trigger and deadline for notifying the authority is one of the
  open items for counsel (see `docs/NEEDS_FROM_ME.md` / the DPIA's gap
  list) — until confirmed, this procedure treats "without undue delay"
  as **no later than 72 hours** after the breach is confirmed (not
  merely suspected), as the more conservative of the two standards
  Ownly's own documents already reference.
- **To an affected sub-processor** (if the breach originated at Ownly
  and could affect their obligations under a DPA, e.g.
  `contracts/DPA_Schedule.md`): promptly, so they can assess their own
  exposure.

## What a notification to an affected individual includes

- What happened, in plain language.
- What data of theirs was involved (be specific — "your child's name and
  a reference photo," not "some data").
- What Ownly has done to contain it.
- What the individual can do (e.g., nothing required, or "we recommend
  X").
- A contact point for questions.

## Post-incident

- Within 2 weeks of containment: a written root-cause summary and the
  specific fix shipped (code change, access-control change, or vendor
  conversation) — added to `docs/DECISIONS.md` the same way every other
  security-relevant fix in this codebase is documented, so the fix is
  traceable, not just a verbal assurance.
- The DPIA (`Ownly - Data Protection Impact Assessment (DPIA)`) is
  revisited if the breach reveals a risk not already captured in its
  risk table.

## What this procedure does not yet cover

- A confirmed, counsel-reviewed notification deadline specific to UAE
  PDPL (using the 72-hour GDPR norm as a placeholder above).
- A designated data protection contact point (blocked on Meydan Free
  Zone incorporation — see the Legal page's `entityNote`).
- A tested incident-response drill — this procedure has not been
  rehearsed against a simulated breach.
