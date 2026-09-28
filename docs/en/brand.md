# Brand

## Name

**Ownly** (أونلي) — renamed twice per the founder's decisions: "Khayali"
→ "TooniX" → "Ownly" (see `docs/DECISIONS.md`, most recently "Rebrand:
TooniX to Ownly, new logo"). The name plays on "own" — a story that's
truly *this* child's own — while sounding like "only," the one story
like it. Still a working name in the legal sense: an informal search
found a real prior-use conflict for "TooniX" (Cartoon Network's own
"Toonix" brand, used for children's content), which is exactly why an
informal search is not a substitute for a formal one — "Ownly" needs
its own real UAE/GCC trademark screening and domain-availability
confirmation before it appears on anything public. See
`docs/NEEDS_FROM_ME.md`. Never state or imply trademark uniqueness
before that clearance happens.

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
  `public/icons/icon.svg` for the PWA manifest): three open, nested
  arcs — lagoon teal outer, coral middle, saffron inner — sharing one
  gap, like a fingerprint whorl or an open "O." Ties directly to the
  name's own meaning: a story as unique as a fingerprint, truly this
  child's own. Deliberately *not* a full closed circle (which would
  echo an unrelated existing "concentric rings" mark, e.g. a fitness
  tracker's activity rings — checked by rendering the two side by side
  before settling on open arcs instead). Reads clearly down to a 16px
  favicon (checked visually). `variant="default"` draws its own dark
  rounded-square badge (safe on any background, including print);
  `variant="flat"` skips the badge for surfaces that are already dark.
- **Illustration style**: the fixed style prompt for real AI generation
  (once enabled) targets "warm, premium children's storybook illustration
  style, soft rounded shapes, gentle consistent lighting, culturally
  appropriate for the UAE" — see `src/lib/providers/image/factory.ts`.

## Mascot

**Marya the Fox** — a consistent guide character appearing across every
story theme, giving the product a recognisable "face" independent of any
individual child's avatar.

## What's not done yet

Real trademark/domain clearance for "Ownly" (flagged in
`docs/NEEDS_FROM_ME.md` — given what happened with "TooniX," worth
paying for an actual trademark lawyer this time rather than relying on
informal searches alone), a full written brand guidelines document, a
demo video for the landing/home pages, and regenerating the mobile app
icons/splash screens (the Android/iOS projects still ship Capacitor's
generic default icon/splash assets — cosmetic only, doesn't affect
anything already renamed to Ownly in code or copy).
