# Sales kit

## One-line pitch

TooniX turns every child into the hero of a personalised, illustrated
story that teaches them something real — built for nurseries, schools,
clinics, banks, and brands who want a gift that actually gets read.

## The problem

Generic branded giveaways (mugs, tote bags, certificates) get thrown
away. Nurseries and schools need to teach values and habits — health,
honesty, money — and struggle to make that content feel personal at
scale. Brands (banks, developers, hospitals) want a loyalty/appreciation
gift that reflects well on them and is actually treasured by a family.

## The solution

A platform that generates a real, illustrated storybook starring the
specific child — their name, their chosen avatar, their language — built
around a values-based theme the organisation picks. Staff review and
approve every story before a parent ever sees it. Parents consent before
anything is created. Nothing here relies on uploading a child's photo.

## Why recurring, not one-time

The easy pitch is "a graduation keepsake" — don't let it stop there.
That framing caps the product at a single moment a year and misses
why it's actually priced and built as a subscription:

- **Nurseries** get a *new* personalised story added every month, each
  one matched to whatever's on the curriculum that month (hand-washing
  in flu season, honesty after a classroom incident, saving money
  before Eid, National Day in December). That's a running values
  curriculum a parent sees land every month, not a single souvenir
  handed out once a year — graduation and National Day are good
  moments to *start* the conversation, not the reason a nursery keeps
  paying.
- **Families** build an evolving personal library as their child grows
  — this month's story is always new, so unlike a one-off printed gift
  the product never gets "used up," and there's a fresh reason to open
  the app every month.
- **The pricing already reflects this**: every plan (`family`,
  `family_plus`, and the nursery `starter`/`growth`/`network` tiers) is
  a monthly (or annual) story *allowance that resets every period* —
  not a one-time story pack. See `docs/en/pricing.md` for the plans and
  its "Seasonal calendar" note on using the school year's key moments
  to open a subscription, not to define it.

## Who buys this

| Segment | Use case |
|---|---|
| Nurseries & schools | An ongoing monthly values curriculum + parent engagement — graduation/National Day keepsakes are a bonus moment, not the product |
| Clinics & dentists | Take-home education (hand-washing, brushing teeth) after a visit |
| Children's hospitals | Comfort/education material for young patients |
| Banks | Financial-literacy campaigns, family loyalty gifts |
| Property developers | Family-focused community/loyalty campaigns |
| Children's brands | Branded educational content, customer appreciation |

## What makes it defensible

- **Database-driven, bilingual themes** with correct Arabic grammar
  handling (gendered pronoun/verb conjugation, not word-for-word
  translation) — most personalised-content tools treat Arabic as an
  afterthought.
- **Staff approval is mandatory**, not optional — nothing reaches a
  parent unreviewed.
- **Privacy-first architecture**: no child photos required, tenant data
  isolation proven by automated tests against real database-level
  enforcement, consent tracked and revocable.
- **Print-ready output**, not just a screen experience — a real keepsake.
- **Customer-driven theme roadmap**: any nursery or family can suggest
  a new habit/topic for a future story straight from the Stories page
  — a direct line from what they actually need to what gets built
  next, not a fixed catalog they're stuck with.

## Objection handling

- *"Is this safe for children's data?"* — See `docs/DECISIONS.md` and
  `docs/NEEDS_FROM_ME.md` for the current privacy posture and pending
  legal review. No photo is required; consent is explicit and
  revocable; data isolation between organisations is automatically
  tested.
- *"Does it work in Arabic?"* — Yes, natively, with a review gate: no
  Arabic story theme is used with a real child until a native Arabic
  speaker has approved its wording.
- *"What if we don't like a generated story?"* — Staff review and
  approve every page before a parent ever sees it, and can regenerate
  individual pages.

## Status disclosure for early conversations

This is presently a working product foundation (Phase 1-2B): sign-up,
children, consent, story generation with a free placeholder illustrator,
approval, reader, and print-ready PDF export are all built and tested.
Paid AI illustration and billing are architected but not yet
vendor-connected — be transparent about this with early pilot customers
per `docs/NEEDS_FROM_ME.md`.
