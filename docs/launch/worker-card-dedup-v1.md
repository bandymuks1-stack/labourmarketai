# Worker card dedup v1 — WorkCard folded into the hub Asmens kortelė

Follow-up to PR #690. Removes the last worker-dashboard identity duplication:
`/dashboard` (worker branch) used to render BOTH the hub `Asmens kortelė` and a
separate `<WorkCard>` ("Mano darbo kortelė"). Now there is **one** worker
identity/card area — the hub person block — which carries the folded next
action + inline editor.

## What moved (behavior preserved)

WorkCard's **launch-critical actions** were folded into the hub person block:
- **State-aware next action** — the ONE best next step from
  `deriveWorkCardState(cardData.signals)` (`next.dim` / `next.href` / `why`).
- **Inline availability/location/pay editor** — the existing client
  `WorkCardEditor`, unchanged. It still writes via the real
  `saveWorkerCardAction` / `confirmWorkerCardAction` RPCs (`save_worker_card` /
  `confirm_worker_card`), keeps its stale "Ar tai vis dar galioja?" confirm, and
  keeps its own `firstActionCardClicked` telemetry.

### Wiring
- `dashboard/page.tsx` (worker branch) still computes `cardData` via
  `getWorkerCard(...)` (the SSR-parallel guard keeps the worker read block),
  derives `{ state, next, values }` with `deriveWorkCardState`, and passes it as
  `workEditor` into `<PremiumHubScreen … workEditor={workEditor} />`.
- `PremiumHubScreen` threads `workEditor` to `PremiumHubPersonCard`, which
  resolves the `auth.dashboard.workCard` editor labels (server) and renders
  `<WorkCardEditor>` under a "Vienas aiškus kitas žingsnis" section.
- The `id="work-card"` anchor (the profile hub's availability-pillar deep-link
  target) now wraps the worker-branch hub, so `/dashboard#work-card` still lands
  on the canonical editor.

## What was intentionally NOT moved (per goal scope)

Only the next action + inline editor were folded. WorkCard's informational
extras are dropped from the dashboard because the hub person block already
covers identity + a completeness ratio + real skill/evidence counts:
- readiness ring, the 3 stat tiles, the "known"/"missing" chips — subsumed by
  the hub person block's completeness bar + `HubStat` tiles.
- the read-only **EmployerPreview** mirror — no longer mounted on the dashboard
  (its component + honesty test remain in the codebase for any future mount).

## Removed

- **`components/app/work-card.tsx`** — deleted (its only mount was the worker
  dashboard branch).
- **`lib/guards/work-card-player-identity.test.ts`** — deleted (it solely tested
  the removed component).

## Kept (still used)

`work-card-editor.tsx` (folded into PersonCard), `work-card-state.ts` (the pure
engine — still derives the next action), `work-card.ts` (`getWorkerCard`),
`work-card-actions.ts` (the save/confirm RPCs), `work-card-missing-chip.ts` (the
editor imports its open-event const), `readiness-ring.tsx` / `employer-preview.tsx`
(shared components), and the `auth.dashboard.workCard` i18n namespace (the
editor's copy).

## Guards updated (only those that pinned WorkCard / its placement)

- Mount/placement (page): `dashboard-hierarchy`, `dashboard-chain-reachability`,
  `mobile-first-room-polish`, `worker-nav-human-labels`, `my-space-human-entry`
  — repointed from `<WorkCard>` to the folded `workEditor={workEditor}` in the
  hub; the hierarchy order swaps `<WorkCard` for `<PremiumHubScreen`.
- Component-read (read the deleted file): `clickability-actionability`,
  `click-target-repair`, `employer-preview-honesty`, `my-space-human-entry` —
  dropped the now-moot `work-card.tsx` assertions, kept every assertion about
  surviving shared files (editor, missing-chip, employer-preview component,
  player-card).

Telemetry contracts unchanged: `dashboardViewed` + `firstActionCardViewed` stay
in `page.tsx`; `firstActionCardClicked` stays in `work-card-editor.tsx`.

## Validation

typecheck ✓ · lint ✓ · build ✓ · full vitest ✓ (521 files / 8158 tests) ·
`check:i18n-debt` ✓ · `check:primary-route-smoke` ✓ · Playwright 390px (LT+RU) +
desktop of the folded editor ✓ (no overflow, 4 hub blocks, one identity area,
next action + editor present, no standalone WorkCard) · `/dashboard/hub` → 404.
