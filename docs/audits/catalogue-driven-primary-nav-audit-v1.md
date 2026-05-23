# Catalogue-Driven Primary Nav Audit v1

> **Type:** rigidity audit for the primary nav surface.  
> **Base:** `main` @ `2ce3fa4` (PR #36 merged).  
> **Branch:** `feat/cc/catalogue-driven-primary-nav-v1`.  
> **Method:** source review + central-config inventory + guard tests.
> Authenticated production smoke remains **PENDING**.

This sprint resolves the "BottomNav + DashboardTabs are hand-listed"
item flagged at the end of PR #36's report. After this PR the primary
nav is generated from the feature-availability catalogue.

## Findings

| # | Question | Score | Evidence |
| --- | --- | --- | --- |
| 1 | Where was the primary nav list maintained before this PR? | PASS | Two hand-listed `TABS` arrays — one in `apps/web/components/app/bottom-nav.tsx`, one in `apps/web/components/app/dashboard-tabs.tsx`. Both encoded the same four routes and labels but lived in two files. Renaming a tab or adding a fifth meant editing both. |
| 2 | What is the new source of truth? | PASS | `apps/web/lib/config/feature-availability.ts` — the catalogue gets a new `"overview"` feature whose `primaryRoute: "/dashboard"` and `safeToShowInPrimaryNav: true` mark it as a primary nav target. `apps/web/lib/config/navigation.ts` calls `getVisiblePrimaryFeatures()` and maps the result through a small `TAB_META` table (short tab label + icon key) into `VISIBLE_PRIMARY_NAV_ITEMS`. |
| 3 | What can the renderer components NOT decide on their own anymore? | PASS | The list of tabs, the routes, and the i18n key for each tab label. They keep deciding ONLY the visual style (active vs inactive class, layout) and the icon-id → lucide component mapping. |
| 4 | Can a preparing feature accidentally become a tab? | PASS | No — `getVisiblePrimaryFeatures()` filters on `availability === "active"` AND `safeToShowInPrimaryNav === true`. A separate guard test ("preparing features cannot appear in TAB_META") asserts every key in the meta map maps to an `availability: "active"` row in the catalogue. |
| 5 | Can a feature become a tab without explicit opt-in? | PASS | No — even if a feature flips `safeToShowInPrimaryNav: true`, it must also be present in `TAB_META` (with an icon + short label). Two-step gate intentional — tab visuals are tightly controlled. |
| 6 | What's the cost of adding a new tab now? | PASS | Two lines: flip `safeToShowInPrimaryNav: true` (or add the feature row) in `feature-availability.ts`, then add `{ tabLabelKey, iconKey }` in `navigation.ts`. No component edits. |
| 7 | What's the cost of removing or hiding a tab? | PASS | One line: flip `availability` to `"preparing"` / `"hidden"` (or `safeToShowInPrimaryNav: false`). The renderer drops the tab automatically. |
| 8 | Does the change touch any DB / RLS / auth / billing surfaces? | PASS | No. Source-only refactor. Guard test "no migration files added by this sprint" still holds. |
| 9 | Does the change touch the authenticated UI behaviour? | PARTIAL | Visually identical (same four tabs in the same order). Authenticated production smoke is still **PENDING** (owner action) — the catalogue swap is mechanically equivalent at the source level but a final live walk-through is on the owner. |
| 10 | What stays unchanged for users? | PASS | Order, labels, icons, routes — the visible four tabs are byte-identical. Active-state highlighting unchanged. Bottom-nav safe-spacing class unchanged. The `/dashboard/discover` + `/dashboard/search` honest-empty routes remain off primary nav. |

## Companion files

- `docs/evidence/feature-availability-route-check-v2.md` — updated route
  + nav availability table including the new `overview` feature row.
- `docs/product/catalogue-driven-primary-nav-v1.md` — documents how the
  nav source flows from catalogue → meta → renderer.
- `apps/web/lib/config/navigation.ts` — the meta + derivation.
- `apps/web/lib/config/feature-availability.ts` — the source of truth.
- `apps/web/lib/guards/product-readiness.test.ts` — 6 new assertions
  enforcing the invariants above.
