# Test checklist (Phase 2A/2B)

Eight things you can check yourself, in plain language, once the app is
running locally (`npm run dev` after following "How to run it" in
`docs/HANDOFF.md`) or on a demo deployment. Each one says what to do,
what you should see, and what failure looks like.

## 1. Sign up and create your nursery
**Do:** Go to `/en/sign-up`, fill in an organisation name, your name,
email, and a password, and submit.
**Expect:** You land on a dashboard showing your organisation's name in
the sidebar.
**Failure looks like:** An error message stays on screen, or the page
just reloads with empty fields.

## 2. Add a child and see their avatar
**Do:** Go to Children → "Add a child", fill in a first name, pick hair /
skin tone / outfit colour, and save.
**Expect:** The child appears in the table with a small illustrated
avatar matching what you picked — never a photo.
**Failure looks like:** The child doesn't appear, or the avatar is blank.

## 3. Two nurseries can never see each other's children
**Do:** This one is proven automatically — run `npm test` and look for
`tests/integration/tenant-isolation.test.ts` passing (9 tests).
**Expect:** All 9 pass.
**Failure looks like:** Any test in that file fails — this would mean a
real privacy bug, so treat a failure here as urgent.

## 4. Consent must be granted before a story can be created
**Do:** Open a newly added child (consent = "Not requested"). Try to
create a story.
**Expect:** You're told a story can't be created until the parent
consents — no theme picker is shown.
**Failure looks like:** A story gets created anyway.

## 5. Request consent, grant it, then create a story
**Do:** On a child's page, click "Generate consent link", copy the link
it gives you, open it in a new private/incognito browser tab, and click
"I consent". Go back to the child's page and refresh.
**Expect:** Consent status flips to "Granted", and a theme picker with
approved themes now appears.
**Failure looks like:** The link doesn't work, or the status doesn't
update.

## 6. Generate, review, and approve a story
**Do:** Pick a theme and click "Generate story". Wait a few seconds and
open the story from Stories. Look at each page's placeholder illustration
and text, then click "Approve".
**Expect:** Every page shows a simple placeholder illustration (this is
the free "mock" generator — no AI cost yet) and readable story text with
the child's name in it. After approving, a "Download PDF" button appears.
**Failure looks like:** Pages stay stuck on "Generating" forever, or
Approve is greyed out with no explanation.

## 7. Download a print-ready PDF
**Do:** Click "Download PDF" on an approved story.
**Expect:** A PDF downloads and opens correctly — cover page with the
title and child's name, a dedication page, one page per story page with
its illustration and text, sized for A5 printing.
**Failure looks like:** The download fails, or you get an error message
naming a specific problem (this is intentional — the system is built to
fail loudly rather than hand you a broken print file).

## 8. Arabic stories read right-to-left correctly
**Do:** Add a child with Arabic as their preferred language, grant
consent, and create a story (only themes marked as reviewed will be
offered — see the owner dashboard at `/en/owner` for which ones those
are).
**Expect:** The story text reads correctly right-to-left, and the PDF
export also reads right-to-left with properly joined Arabic letters (not
disconnected/backwards characters).
**Failure looks like:** Text reads left-to-right, or Arabic letters look
disconnected or reversed. **Every Arabic story is still marked
"needs native review" internally until a native Arabic speaker confirms
the wording itself reads naturally** — this check is about the technical
RTL/print rendering, not the wording.

---

For anything beyond these 8 — billing, real AI image generation, the
owner dashboard, security hardening — see `docs/HANDOFF.md` "Known
limitations" for what's built vs. what's next.
