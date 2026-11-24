# PR-D1R — Visible Premium Dashboard Player Card Rework (note)

**Date:** 2026-06-29 · **PR:** #560 (amended, same branch
`feat/cc/pr-d1-player-card-variant-adoption`) · **Type:** UI-only, one surface ·
**Owner rule:** no merge, no production deploy.

Owner feedback on the first #560 version: *"dashboarde nematau pasikeitimo ypač
pagerėjimo iki premium lygio"* — a small avatar addition wasn't a visible improvement.

## 1. Why the first #560 version was not visually enough
It only added a 56px avatar tile next to the existing text greeting. The card still
read as a plain greeting + a wall of equal dimension rows, not as a Player Card. It
did not visibly answer "what does the system know / what's missing / what are the
best next actions" as one premium module.

## 2. Exact dashboard file/component touched
- `components/app/work-card.tsx` — rebuilt the render into a compact premium Player
  Card: identity band → known-signals chips → missing chips → best next steps (≤3).
- `app/[locale]/dashboard/page.tsx` — unchanged from the avatar wiring already added
  (passes `avatarUrl={workerAvatar.signedUrl}`). No new data read added by the rework.
- `lib/guards/work-card-player-identity.test.ts` — extended to pin the new module
  structure (identity band + known/missing + ≤3 actions).

## 3. Exact existing data used (no invented values)
`data.name`, `data.professionName`, `data.avatarUrl` (from existing `getOwnAvatar`),
and `deriveWorkCardState(data.signals)` → `clear[]` / `missing[]` / `next` (the same
pure engine already in use; real saved signals: profession+skills, availability,
location, pay, evidence count). Readiness pill = `clear.length / total` (a real count
of saved dimensions, not a score/match).

## 4. Exact actions preserved
- Primary next action + inline editor: existing `WorkCardEditor` (unchanged props).
- Employer preview: existing `EmployerPreview` (unchanged), collapsed at the bottom.
- Secondary actions are links to EXISTING page targets only — profile
  (`/dashboard/profile`) for profession/skills, journal (`/dashboard/journal`) for
  evidence — sourced from the engine's own `HREF` map. Total visible actions ≤ 3.

## 5. Boundaries not crossed
No DB/RLS/RPC/migration, no auth, no route changes (only links to existing routes),
no matching-engine change, **no journal code change** (journal is only a link target),
no new profile/CV/map/player-card model, no fake/demo data, no new i18n keys (reuses
existing `dim.*`, `next.*`, `clearTitle`, `missingTitle`, `nextEyebrow`), no broad
dashboard redesign (single component), no merge, no deploy.

## 6. Before / after visual review checklist
- [ ] Identity band: avatar/photo OR initials + name + profession/role reads premium.
- [ ] "Known" chips show only real saved dimensions (✓), honest when empty.
- [ ] "Missing" chips show real missing dimensions (+), honest when none.
- [ ] Readiness pill shows real N / total.
- [ ] ≤ 3 next actions, each opening an existing working target.
- [ ] Existing inline editor + employer preview still work.
- [ ] Desktop is not a stretched plain card; mobile 360px is intentional.

## 7. Mobile 360px acceptance notes
Identity band: avatar (lg) + min-w-0 truncating name column + shrink-0 readiness
pill — fits 360px. Known/missing render as wrapping chip rows. Actions stack full-
width. To verify on the Vercel Preview at 360px (DevTools device toolbar).
