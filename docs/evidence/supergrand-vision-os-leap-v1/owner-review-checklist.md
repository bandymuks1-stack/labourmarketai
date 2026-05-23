# Owner manual review checklist — Supergrand Vision OS Leap v1

**Status: PENDING — owner action only.**

Owner walks through this checklist on the live deploy after this PR
merges + Vercel marks the deploy as Ready. Do **not** flip the status
block at the bottom unless every row is honestly green.

## 10-second test

Open `https://app.labourmarket.ai/lt/vision` on mobile.

- [ ] Within 10 seconds of looking at the screen, the eyebrow / hero
  / lede make it obvious this is a labour-market operating system,
  not a job board.
- [ ] The "honesty" paragraph just below the hero is visible — it
  explicitly tells the visitor that the rest of the page lists what
  is live vs what is preparing.

## Section-by-section

### Today live

- [ ] The "Live today" block shows exactly the catalogue's active
  features (overview, profile_text_first, journal_text_first,
  account_roles).
- [ ] No row in this block shows the `RUOŠIAMA` chip.

### Roles

- [ ] Darbuotojas / Worker shows AKTYVU.
- [ ] Įmonė / Agentūra / Pirkėjas (Company / Agency / Customer) show
  RUOŠIAMA.
- [ ] No freelancer / team lead / service provider rows are visible —
  those are hidden in the catalogue.
- [ ] No CTA on a preparing role row.

### Activities

- [ ] Active rows: only `work_done` and `skill_claim`.
- [ ] Preparing rows: the other 8 activity types — they appear with
  the RUOŠIAMA chip and no CTA.

### Preparing features

- [ ] The "Preparing" block lists role_expansion, external_confirmation,
  company / agency / customer workspaces, document_records, team_offers,
  work_needs, service_offers. Each carries the RUOŠIAMA chip and a
  short description.

### Control room

- [ ] Owner production smoke status: PENDING.
- [ ] PR #18 status: BLOCKED.
- [ ] Non-worker spaces status: Ruošiama / Preparing.
- [ ] Fake AI / matching / verified status: Niekada nenaudojama /
  Never used.

### Future layers

- [ ] Draft / scouting, live monitor, AI orchestrator, trust /
  reputation — each visible as a dashed-border row, no chip.

## Non-locking

- [ ] The lede paragraph explicitly says the first choice is an
  entry point, not a cage.
- [ ] The role evolution section reads consistently with the
  account-page rolesIntro paragraph.

## Honesty

- [ ] No "AI verified" / "AI matched" / "automatic approval" /
  "guaranteed match" / "trust score" anywhere on the page.
- [ ] No "patented" / "patent pending" claim anywhere on the page.
- [ ] No pricing surface, no checkout button, no "upgrade" CTA.

## Mobile

- [ ] No horizontal overflow at iPhone 13 width (390 px).
- [ ] Section headings + chips wrap cleanly.
- [ ] Hero CTA + nav links stay within the viewport.

## Desktop

- [ ] Grids render 2-up on tablet, 3-up on desktop.
- [ ] No orphan card in the rightmost column.
- [ ] Footer copy is readable.

## Honest big picture

- [ ] After reading the whole page, the founder feels the vision is
  worth continuing — not because the page exaggerates, but because
  the catalogue genuinely covers the labour-market scope.
- [ ] After reading the whole page, a prospective pilot participant
  understands what they get TODAY (worker text-first + journal +
  account roles) and what's coming.

## Status block

Update only after a real owner walk-through.

```
Owner review status: PENDING
Date:                —
Performed by:        —
Production deploy SHA: —
Result:              —
```

## Companion checklists (still PENDING)

- `docs/evidence/post-merge-production-smoke-pr30.md` (PR #30).
- `docs/evidence/super-max-cosmo-pilot-readiness-v1/owner-production-smoke-checklist.md` (PR #39).

All three checklists must be PASSED before the founder publishes the
`/vision` URL externally as a pilot-onboarding link.
