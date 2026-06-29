# PR560 — Hard Reject → Landing-Level Dashboard Player Card (audit v3)

**Date:** 2026-06-29 · **PR:** #560 (amend same branch
`feat/cc/pr-d1-player-card-variant-adoption`) · **Type:** UI-only, one component ·
**Owner rule:** no merge, no production deploy.

Owner hard-reject of the previous preview: *"dashboard kortelė turi atrodyti taip
pat gerai kaip landing pavyzdžiai. Dabartinis variantas yra silpnas, low-class,
admin panelis. Turi būti premium Player Card, ne tekstinė dėžė su chip'ais."*

## 1. Why the current preview failed
The V2 card was a flat panel: small avatar, a thin text greeting, tiny readiness
*text* pill (`3/5`), and rows of tiny chips on hairline dividers. No dominant
avatar, no readiness **ring**, weak name/role hierarchy — it read as a settings
panel, not the FUT-style scouting Player Card the landing page sells. The
improvement was only visible after explanation → fails the screenshot test.

## 2. Exact landing files/components inspected
- `components/marketing/player-card-showcase.tsx` — the landing "workers as work
  profiles" section (the visual north star).
- `components/app/player-card.tsx` — the FUT-style landing card: `card-border
  bg-card-glow` frame, tier **corner accents**, 96px portrait + **OVRRing**,
  name/role hierarchy, stat meters, skill chips.
- `components/app/ovr-ring.tsx` — the circular gauge primitive (concept rating).
- `components/app/readiness-ring.tsx` — the **honest** twin of OVRRing: same SVG
  gauge + tier shape, arc = real `met/total`, centre shows the count (no fake 0–99).
- `components/app/worker-player-card.tsx` — the existing **real-data** premium
  scouting card (rendered on the journal/CV surface) already built from
  `ReadinessRing` + `card-border bg-card-glow glow-hover` + `Stat` tiles + chips.
- `lib/player-card/readiness.ts` — `ReadinessLevel` + the 0.8/0.4 level thresholds.
- `playerCard.readiness.*` i18n keys (lt/en/ru) — existing level labels reused.

## 3. Screenshot-level differences (landing vs rejected dashboard)
| Landing Player Card | Rejected dashboard card |
|---|---|
| `card-border bg-card-glow` glow frame + corner accents | flat `bg-ink-900/40`, thin top rail |
| dominant 96px portrait | small avatar |
| circular OVR/readiness **ring** | tiny `3/5` text pill |
| strong name + role hierarchy | text-xl greeting, mono role |
| premium stat tiles | none |
| skill/signal chips | tiny chips as the whole body |

## 4. Exact dashboard component(s) changed
- `components/app/work-card.tsx` — rebuilt to the landing visual system: premium
  `card-border bg-card-glow glow-hover` frame + level-driven top border + tier
  **corner accents**; dominant avatar + strong name/role; **ReadinessRing** hero;
  real **stat tiles**; known/missing **signal chips**; ≤3 actions; employer preview.
- `app/[locale]/dashboard/page.tsx` — unchanged (already passes `avatarUrl` via the
  existing `getOwnAvatar()` read). No new data read added.
- `lib/guards/work-card-player-identity.test.ts` — extended to pin the ring + frame.

## 5. Exact real data for each displayed value (no fabrication)
- Avatar/photo → `avatarUrl` (existing `getOwnAvatar`), else initials monogram.
- Name → `data.name`; Role → `data.professionName` (+ real `skillsCount`).
- **Readiness ring** → `met = clear.length`, `total = clear+missing` (the 5 real
  saved work-card dimensions from `deriveWorkCardState`); level via the canonical
  0.8/0.4 thresholds; centre shows `met/total`. Not a score, not a match.
- Stat tiles → `skillsCount`, `evidenceCount` (real saved counts) + readiness
  `met/total`.
- Known chips → real saved dimensions + their values; Missing chips → real gaps
  with the honest `dim.*.missing` copy.
- Actions → primary `WorkCardEditor` (existing) + ≤2 links to existing routes
  (`/dashboard/profile`, `/dashboard/journal`) from the engine HREF map.

## 6. Landing primitive reused/extracted
`ReadinessRing` (the honest landing-gauge primitive) is reused directly; the
premium chrome classes (`card-border bg-card-glow glow-hover rise-in`, corner
accents, `Stat`-style tiles) are mirrored from `worker-player-card.tsx` /
`player-card.tsx` using existing tokens. No new visual system invented.

## 7. Why no fake data was introduced
Every number/label is a real saved signal already loaded for the card; empty states
stay honest (initials when no photo, missing chips for gaps, plain zeros). The ring
is a signal **count**, explicitly not a rating/match.

## 8. Desktop & mobile 360px checklist
- [ ] Desktop: dominant avatar + name/role + ring read as one premium scouting card.
- [ ] Frame: glow border + corner accents + level top-border (not a flat panel).
- [ ] Ring fills by real met/total; centre count + honest level word.
- [ ] Stat tiles show real counts; known/missing chips honest.
- [ ] ≤3 actions, each opens an existing target; editor + employer preview work.
- [ ] 360px: hero stays readable (avatar + truncating name + ring); stats 3-up;
      chips wrap; actions full-width — still looks like a Player Card, not a form.

## 9. Explicit boundaries
No DB/RLS/RPC/migrations · no auth · no routes (only links to existing routes) ·
no journal code change · no matching engine · no new model · no fake data · no
production deploy · no merge.
