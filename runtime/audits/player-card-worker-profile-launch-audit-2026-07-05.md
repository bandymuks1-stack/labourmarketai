# Player Card / Worker Profile — Launch Audit (2026-07-05, PR9)

**Owner question:** is the worker profile / player card a real launch-grade
surface — evidence-based, honest, mobile-first, reachable?

**Headline:** the surface is largely GREEN already (one consolidated identity
system, real evidence tiers, honest verification, safe avatar fallback, no
construction default). PR9 closes four measured gaps: availability/location
were not visible or countable on the profile page; the missing-actions hub
lacked an availability pillar and an opportunities bridge; and the marketing
concept cards' visible "Placeholder" marker was DEFAULT-OFF in production
(§18 risk) with no concept framing in the copy.

## Audit findings (pre-PR9)

| # | Item | Finding | Status |
|---|---|---|---|
| 1 | Routes | `/dashboard/profile` (canonical), `/dashboard/player-card` = deliberate redirect to the journal (Mano CV) where `WorkerPlayerCard` renders; `/cv` export linked. Profile reachable via avatar/account menu + cross-links (deliberate IA from the first-use UX slice, not a gap) | GREEN |
| 2 | Avatar | private bucket + signed URL, honest null degrade, initials monogram fallback everywhere — missing avatar breaks nothing | GREEN |
| 3 | CV/player-card | ONE real data card (`worker-player-card` + `lib/player-card`) with real RLS-scoped counts; marketing FIFA card is a separate placeholder-governed concept | GREEN |
| 4 | Skills + evidence | `worker_skills.source/verified` surfaced as three honest tiers (✓ verified = manager-confirmed only; journal-backed; declared); canonical slugs localized via `skillNames`, never identity | GREEN |
| 5 | Professions | real `worker_professions` → localized labels; no default trade | GREEN |
| 6 | Languages | NO edit/display surface (intake forms only). Matching treats language honestly (`language_unknown`) | **YELLOW — deferred** (documented; a languages editor is a new product surface, post-launch slice) |
| 7 | Availability | editable ONLY on the dashboard Work Card; not visible on the profile page | **FIXED in PR9** |
| 8 | Location | same — dashboard Work Card only; the minimum contract's `location` field was never fed on profile (always "missing") | **FIXED in PR9** |
| 9 | Opportunities/interest link | profile → opportunities link existed below the fold; not part of the actions hub | **IMPROVED in PR9** |
| 10 | Mobile | tap-target min-heights + responsive grids on hub/cards | GREEN |
| 11 | Fake verification | none — "verified" only from `verified || manager_confirmed`; self-view deliberately shows no green glow (silent-trust rule) | GREEN |
| 12 | Construction fallback | contained to fictional marketing placeholders; authenticated surfaces never default to a trade | GREEN |
| 13 | Duplicates | one real card system + one governed marketing concept; former duplicate panels already consolidated | GREEN |
| 14 | §18 marketing concept cards | visible "Placeholder" marker was gated `=== "true"` → hidden in prod by default; showcase copy had NO concept framing — fictional workers could read as real | **FIXED in PR9** |

## PR9 changes (adoption only — no new profile system, no new routes)

1. **Availability pillar** on the profile hub (real `workers.availability_status`
   / `available_from`), deep-linking the ONE canonical editor
   (`/dashboard#work-card` anchor added) — never a duplicate editor.
2. **Location fed into the minimum contract** (`cardSource.location` from the
   worker's own saved country signal) so "location" stops being permanently
   missing on the honest checklist.
3. **"Review matched opportunities" action** in the hub footer (real
   `/dashboard/opportunities` route — matching + interest status).
4. **§18 marketing fix**: the placeholder marker is now DEFAULT-ON
   (`!== "false"`), and the showcase carries a visible concept-preview line
   ("fictional profiles, not real people") in all locales.
5. Guards: `lib/guards/player-card-profile.test.ts` (10 pins, see file).

## Status after PR9

| Path | Status |
|---|---|
| Worker profile + player card (identity, skills evidence, avatar, actions, availability/location, opportunities bridge) | **GREEN scoped** |
| Languages on profile | YELLOW — deferred, documented (matching already honest about unknown) |
| Public (unauthenticated) worker profile page | not built — deliberate (§4 default-closed); future owner decision |
| Marketing concept cards | GREEN (§18-marked by default + visible concept copy) |
