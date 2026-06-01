# Owner review — Room-based account spaces IA reset v1

**Provisional owner review before deploy. Final verdict after deploy.**

## Problem summary
The dashboard violated the room principle: even after the v1 current-space
header, the active `/dashboard` space still rendered the **all-roles catalogue**
and the **generic future-module grid** as permanent content (at the bottom). A
current space must not show all possible roles/spaces — even demoted.

## Fix (PR #204 review update)
The active room now shows **only the current space**; all cross-space content
moved to the **"Mano erdvės / My spaces"** surface at `/dashboard/account`.

### Before → after — `/[locale]/dashboard`
| | Before | After |
|---|---|---|
| Current-space header | (added in v1) | kept — names the space + purpose + "My spaces" link |
| Space's own actions (chain actions, journey, pilot, journal/profile cards) | present | present |
| **All-roles catalogue** (`RoleCatalogueGrid`, every role) | **shown at bottom** | **removed** |
| **Generic future-module grid** (`FeatureAvailabilityGrid comingLater`) | **shown at bottom (both branches)** | **removed** |
| Switch handle | "go to account" link | kept — compact link into `/dashboard/account` |

The dashboard imports for `RoleCatalogueGrid`, `FeatureAvailabilityGrid`, and
`getVisibleRoleOptions` were removed (the active room no longer references them).

### Where "Mano erdvės / My spaces" now lives
`/[locale]/dashboard/account` gains a **`data-testid="my-spaces"`** section,
titled **"Mano erdvės / My spaces"**, that renders the all-roles catalogue +
the future-module grid. This is the single place where other spaces are shown,
added, or explained — never dumped into the active room.

## Room behaviour per space (current state)
- **Personal profile (worker):** current-space header + profile/journal cards. No catalogue, no future grid.
- **Buyer space:** buyer/request actions only; guard asserts the buyer page imports no profile-CV / company / agency / catalogue / future-grid components, and no worker-purchase wording.
- **Company workspace:** company chain actions + hiring pilot; no buyer-request block by default; no catalogue/future grid.
- **Agency space:** agency chain actions; no buyer/private-person block by default.
- **Company-as-buyer:** still flagged as a later/separate concept (no dedicated role/route yet).

## Guards (added/updated)
- `room-based-account-spaces.test.ts`: **fails if `/dashboard` renders `RoleCatalogueGrid` / `getVisibleRoleOptions` / `FeatureAvailabilityGrid`**; requires the catalogue + grid to live under `/dashboard/account` (`my-spaces`); buyer page renders none of the other spaces' components; plus the v1 room rules (role→space map, switcher labels, no worker-purchase in buyer copy, agency≠buyer, no "kas esu operacijoje", no DB/RPC/schema in space copy).
- `owner-role-select-dashboard.test.ts` + `product-readiness.test.ts`: repointed from `/dashboard` to `/dashboard/account` for the catalogue/feature-grid mounts.

## Known limitations / model needed later
- Full **per-space route separation** and an **account-space persistence model** beyond `active_role` are still not built — flagged, not faked.
- **Company-as-buyer** has no dedicated role/route yet.
- The dashboard chain-action card still renders within the active room (it belongs to that space); deeper per-space route splitting is a later IA pass.

## Routes affected (copy/UI only)
- `/[locale]/dashboard` — current-space header; **removed** all-roles catalogue + future-module grid.
- `/[locale]/dashboard/account` — **added** the "Mano erdvės / My spaces" section (catalogue + future grid moved here).

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1374 passed / 99 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/room-based-account-spaces-ia-reset-v1`
- Base main SHA: `a4b0563`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
