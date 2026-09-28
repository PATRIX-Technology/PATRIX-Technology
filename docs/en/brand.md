# Brand

## Name

**TooniX** (تونكس) — renamed from "Khayali" per the founder's decision
(see `docs/DECISIONS.md` "Rebrand: Khayali to TooniX"). Still a working
name in the legal sense: the earlier name-conflict check was done for
"Khayali," a different name, so "TooniX" needs its own basic UAE/GCC
trademark screening and domain-availability confirmation before it
appears on anything public. See `docs/NEEDS_FROM_ME.md`. Never state or
imply trademark uniqueness before that clearance happens.

## Positioning

A premium, trustworthy, educational storytelling platform — suitable for
a nursery director, school administrator, bank marketing team, hospital,
or major property developer to purchase and put their name behind.
Explicitly **not** generic startup-blue SaaS, and **not** childish
primary-colour clip art. Warm, modern, culturally at home in the UAE,
credible internationally.

## Voice

- Warm but not saccharine.
- Confident and specific ("a story that teaches healthy eating," not
  "amazing personalised content").
- Respectful of both English and Arabic as equally primary languages —
  Arabic copy is written for Arabic readers, never mirrored word-for-word
  from English.

## Visual identity

- **Palette**: lagoon teal (primary), saffron and coral (warm accents),
  ink/cream neutrals. See `tailwind.config.ts` for exact values.
- **Typography**: Fraunces (display/headlines — warm, literary serif),
  Inter (English body/UI), Noto Kufi Arabic (Arabic UI), Noto Naskh
  Arabic (Arabic print/reading body — a more traditional book-reading
  face than the UI face, deliberately).
- **Mark** (`src/components/brand/Logo.tsx`, mirrored as the static
  `public/icons/icon.svg` for the PWA manifest): two overlapping
  four-point sparkles — a larger lagoon-teal one with a smaller coral
  one tucked behind its top-right tip, plus a small saffron accent dot.
  Deliberately *not* a literal "X" cross shape (that reads as a
  cancel/delete icon at small sizes); the two sparkles' crossed
  diagonal arms evoke the "X" in "TooniX" without drawing it literally,
  and the two overlapping sparks double as "every child gets their own
  story." Reads clearly down to a 16px favicon (checked visually).
  `variant="default"` draws its own dark rounded-square badge (safe on
  any background, including print); `variant="flat"` skips the badge
  for surfaces that are already dark.
- **Illustration style**: the fixed style prompt for real AI generation
  (once enabled) targets "warm, premium children's storybook illustration
  style, soft rounded shapes, gentle consistent lighting, culturally
  appropriate for the UAE" — see `src/lib/providers/image/factory.ts`.

## Mascot

**Marya the Fox** — a consistent guide character appearing across every
story theme, giving the product a recognisable "face" independent of any
individual child's avatar.

## What's not done yet

Trademark/domain clearance for "TooniX" (flagged in
`docs/NEEDS_FROM_ME.md`), a full written brand guidelines document, and
regenerating the mobile app icons/splash screens from the new mark
(the Android/iOS projects still ship Capacitor's generic default
icon/splash assets — cosmetic only, doesn't affect anything already
renamed to TooniX in code or copy).
