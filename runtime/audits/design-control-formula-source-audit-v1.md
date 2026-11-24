# Design Control Formula — Source-Grounded Audit v1

**Date:** 2026-06-29 · **Scope:** profile, CV, Player Card, dashboard, market map,
skills, journal, request/action surfaces. **Method:** read the current source on
`main` (post PR3–PR12). **Output:** what exists · duplicate/drift · broken/unclear
paths · dead-looking clickables · weak mobile · LT/EN/RU copy · do-not-rebuild ·
exact next PR sequence.

> **Audit only. No implementation.** No DB/RLS/RPC/auth/route changes proposed for
> this PR. Companion doctrine: `docs/product/design-control-formula-v1.md`.

---

## 1. What already exists (real routes / components / libs)

### Identity / Player Card (the core model — §4)
- `lib/identity/player-identity.ts` — **canonical VISUAL identity contract**: 7
  variants (`hero`, `profile`, `cv-header`, `work-strip`, `dashboard-compact`,
  `map-marker`, `request-provider`), `PLAYER_AVATAR_PX` scale, `playerInitials`
  (= `personMonogram`). Additive vocabulary; surfaces adopt incrementally
  (`docs/design/player-identity-adaptation-plan.md`).
- `lib/identity/player-card-minimum.ts` — `buildPlayerCardMinimum()`: the **single
  "what's missing" contract** (fullName/email/avatar/about/skills). Guard-protected
  (`lib/guards/player-card-minimum-contract.test.ts`, `profile-hub-minimum-contract.test.ts`).
- `lib/player-card/player-card.ts` — `WorkerPlayerCard` **data dimensions** (declared/
  journal-supported/candidate skills, evidence entries, verified-skill badges,
  availability). `lib/player-card/readiness.ts` + `readiness-steps` + `labels.ts`.
- Components: `components/app/player-card.tsx`, `worker-player-card.tsx`,
  `worker-readiness-panel.tsx`, `avatar-display.tsx`, `today/today-screen.tsx`,
  `components/marketing/player-card-showcase.tsx`.
- Route `app/[locale]/dashboard/player-card/page.tsx` → **redirect** to
  `/dashboard/journal` (merged into Mano CV, owner IA cleanup 2026-06-25).

### Dashboard / Control Center (§3)
- `app/[locale]/dashboard/page.tsx` — worker vs org branches; worker shows
  `CurrentSpaceHeader` + `WorkCard` (Mano darbo kortelė, state-aware) + `MyZone`.
- `components/app/my-zone.tsx` — fast-actions grid (journal/profile/opportunities/
  planning/map/messages/documents + company), readiness status line, "what improves
  what". (Findability extended in PR #547.)
- `components/app/dashboard-next-action.tsx`, `dashboard-chain-actions.tsx` — role
  next-action.

### CV / Profile (§5)
- `app/[locale]/dashboard/profile/page.tsx` — identity (avatar), managed companies,
  `ProfileHubOverview`, trust block, capability section, text-first flow.
- `components/app/profile-hub-overview.tsx` — completion pillars sourced from
  `buildPlayerCardMinimum().missing`; each pillar links its fill surface.
- `app/[locale]/cv/page.tsx` + `lib/cv-export/verified-cv.ts` — sendable print→PDF
  Verified CV (identity header + summary + skills tiers + **work history** (PR #548) +
  confirmed proof).

### Skills / Evidence (§7)
- `lib/profile/skill-claim-extractor.ts` — deterministic cross-sector recognizer
  (PR #553); free labels persist via `lib/profile/profile-skill-claims.ts`
  (`profile_skill_claims`, status self-declared). `lib/structuring/capability-labels.ts`
  localizes labels. `app/[locale]/dashboard/reports/evidence/page.tsx` evidence report.

### Market Map (§6)
- `app/[locale]/dashboard/market-map/page.tsx` + `MarketMapBase` + `MapLayersLegend`
  (real own signals; future layers honest-disabled). Operating-layer bridge (PR #552).
  Guard-frozen honesty: `lib/guards/compact-nav-marketplace-ia.test.ts`,
  `market-map-self-signal.test.ts`.

### Opportunities / Matching (§7)
- `app/[locale]/dashboard/opportunities/page.tsx` + `lib/opportunities/match-card-view.ts`
  (`buildMatchCardView`) + `components/app/match-signals.tsx` — per-dimension fit, no
  score/AI, honest empty/needs-access, next-step bridge (PR #555).

### Diary / Journal + Requests
- `app/[locale]/dashboard/journal/page.tsx` — day-grouped entries + evidence timeline.
- `service-requests` + `services` (marketplace loop, PR #550 connections);
  `marketplace` → **redirect** to `market-map`.

---

## 2. Duplicate / drifting surfaces

1. **Player Card spans two lib roots.** `lib/identity/*` (visual contract + minimum
   contract) vs `lib/player-card/*` (data dimensions + readiness). These are
   *layered, not duplicate* (visual / minimum / data), but the split reads as drift
   and invites a second model. **Risk:** `lib/player-card/readiness.ts` becoming a
   competing completion source against the guard-blessed `buildPlayerCardMinimum`.
   → Converge naming/usage; do **not** create a third model.
2. **Multiple readiness/completion surfaces.** `ProfileHubOverview` (minimum contract),
   `MyZone` readiness status, `worker-readiness-panel`, `WorkerReadinessSummary`
   (company), `lib/player-card/readiness.ts`. Several "what's missing/ready" views.
   → All must derive from ONE contract (`buildPlayerCardMinimum` for identity
   essentials); none may invent its own completion math.
3. **Identity rendered by several components** (`player-card.tsx`,
   `worker-player-card.tsx`, `avatar-display.tsx`, marketing `player-card-showcase`).
   The `player-identity.ts` variant contract exists to unify them; **adoption is
   partial** — surfaces still size/skin avatars ad-hoc (the `PLAYER_AVATAR_PX` note
   calls out 40/48/52/56/64/96 fragmentation).

## 3. Broken / unclear user paths (verify in tester smoke — none invented)

- Known dead-tap classes were closed this session: profile/journal tap targets
  (PR #545), MyZone findability (PR #547). No *new* broken path is asserted here —
  the live-tester ledger (`docs/audits/live-tester-feedback-ledger-v1.md`) is the
  source for real tester-observed breakage. **Do not fabricate breakage.**
- Intentional redirects (NOT dead): `/dashboard/player-card` → journal;
  `/dashboard/marketplace` → market-map. Keep as redirects (guard-frozen).

## 4. Elements that look clickable but may not open the expected path

- Map **future-layer chips** are `aria-disabled` by design (honest "not on map yet")
  — correct per §2.4, not a defect; verify testers read them as disabled, not broken.
- Confirm every `ProfileHubOverview` pillar + `MyZone` action resolves to a real
  screen (they do today: pillars → `#profile-edit`/journal; actions → existing
  routes). Re-verify after any copy change.

## 5. Where mobile flow is weak (candidate, verify with testers)

- Dashboard stacks many cards (WorkCard + MyZone grid + count-gated next-actions +
  marketplace access). On 360px this can become a long scroll — candidate for the
  **"max 3 best actions"** compaction (§2.3). No layout change in this audit PR.
- Company control center (`/dashboard/company`) is card-dense; mobile compaction is a
  later, separate path.

## 6. LT/EN/RU copy consistency

- Parity is guard-enforced for active locales (`lib/guards/i18n-lt-en-parity.test.ts`,
  lt/en/ru). RU is Tier-2 (AI-seeded, preview-tagged). New player-card/match copy
  must land in all three with the same key structure (no LT leak — see
  `capability-labels.ts` localization).

## 7. What must NOT be rebuilt

- `buildPlayerCardMinimum` (single completion contract) — guard-protected.
- `player-identity.ts` visual variant contract — **adopt**, never replace.
- `lib/cv-export/verified-cv.ts` (CV builder) and `/cv` print→PDF.
- `lib/profile/skill-claim-extractor.ts` recognizer + `profile_skill_claims` persistence.
- Market-map honest-signal model + legend (guard-frozen) + the marketplace/player-card
  redirects.
- Opportunities `MatchSignals` fit engine (no score/AI).
- No new dashboard, no parallel profile/CV/Player Card/map-signal model (§2.6).

## 8. Exact allowed next PR sequence (UI-only; each stops at §9 conditions)

> One real user path per PR. No DB/RLS/RPC/auth/route/new-matching. Each follows the
> §9 PR scope template (problem · user path · files used/changed/untouched · before/
> after · mobile + LT/EN/RU + smoke proof).

- **PR-D1 — Player Card variant adoption (dashboard + profile identity).** Render the
  dashboard `WorkCard` header and profile identity through the `player-identity.ts`
  `dashboard-compact` / `profile` variants + `PLAYER_AVATAR_PX`, so identity looks
  one product. Visual-only; reuse existing data. Files likely: `work-card.tsx`,
  profile identity section, `avatar-display.tsx`. No new model.
- **PR-D2 — One readiness source.** Ensure `MyZone` + `WorkCard` + any readiness panel
  present identity-essentials from `buildPlayerCardMinimum().missing` (each missing
  item links the exact field). Remove/redirect any parallel completion math. No new
  contract.
- **PR-D3 — "Best 1–3 actions" compaction (dashboard).** Cap the worker dashboard to
  ≤3 primary next actions using existing next-action helpers, each as a 5-question
  card (what/why/match/missing/action). Reduces mobile scroll (§5). UI-only.
- **PR-D4 — Matching explanation grouping (opportunities).** Ensure each opportunity
  card shows *good fit because / missing-risk / action* groupings over the existing
  `MatchSignals` (no algorithm change). Copy/layout only.
- **PR-D5 — Map marker/card consistency.** Adopt the `map-marker` variant; ensure every
  visible marker/card states type · status · reason · action (§6). UI-only; no fake
  markers.

Sequence rule: ship D1→D5 one at a time, green CI each, only on real tester-confirmed
need where applicable; pause any PR that drifts into a stop condition.

---

## 9. Validation (this audit PR)

Docs/audit only — no source changed. Commands run and reported in the PR:
`pnpm -F web typecheck` · `pnpm -F web lint` · `pnpm -F web build` (project uses pnpm
workspace; equivalent to the goal's npm commands).
