# Role catalogue dashboard surfaces — evidence v1

> **Sprint:** `feat/cc/role-catalogue-dashboard-surfaces-v1`  
> **Base commit:** `93bfa46` (PR #37)  
> **Status:** PASS at source + build. Authenticated production mobile
> smoke remains **PENDING** — owner action.

## Per-surface status

| Surface | Source of role data | Active / preparing behaviour | CTA behaviour | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| Dashboard role expansion section (worker dashboard) | `getVisibleRoleOptions()` from `lib/config/roles.ts` | Worker → active card; Company / Agency / Customer → `RUOŠIAMA` chip + reason line; Freelancer / Team lead / Service provider → hidden until catalogue flip. | Worker card renders `<Link href="/dashboard">`; preparing cards render NO link (just the reason line). | Mounting the grid is purely additive; no DB / auth changes. Visible nav unchanged. | PASS |
| Account roles list | `ROLE_BY_ID` from `lib/config/roles.ts` (PR #35) | Each user-held role row tagged via `cfg.availability` — worker AKTYVUS, others RUOŠIAMA. | Static list — no navigation; this is a summary surface. | Same wiring as PR #35, no change this sprint. | PASS |
| RoleSwitcher header dropdown | `LABOUR_MARKET_ROLES` + `ROLE_BY_ID` (PR #35) | Worker active; non-worker rows render `RUOŠIAMA` chip. The non-locking intro renders inside the menu (PR #35). | Switching to a preparing role still calls the existing server action — the destination is the pilot cockpit, which itself is honestly preparing. | Server action path unchanged. | PASS |
| First-use dashboard panel | `auth.dashboard.firstUse.*` i18n (PR #34 / #35) | Universal 5-step path. Role-neutral copy. | 3 CTAs (Continue profile / Add work or activity entry / Review roles) — all backed by active features. | No change this sprint. | PASS |
| Feature availability grid | `getVisibleFeatures()` from `lib/config/feature-availability.ts` (PR #36) | Profile + journal + roles surfaces are active; the 9 preparing rows render preparing cards. | `isFeatureActive` gates `<Link>` (one Link per component, guard-enforced). | No change this sprint. | PASS |

## Mobile evidence

Captures (iPhone 13, 390 × 844, `lt-LT`) live at
`docs/evidence/role-catalogue-dashboard-surfaces-mobile/`. Source script:
`apps/web/scripts/capture-role-catalogue-mobile.ts`. They cover:

1. `01-dashboard-role-catalogue.png` — the new `<RoleCatalogueGrid>` on
   the dev preview surface, showing worker as Aktyvu + Company / Agency
   / Customer as Ruošiama.
2. `02-account-role-catalogue.png` — RoleSwitcher menu open; reads
   the same catalogue.
3. `03-role-switcher-catalogue.png` — same; alternate scroll position.
4. `04-preparing-role-no-broken-cta.png` — preparing role cards with NO
   navigating CTA, only the chip + reason line.

The captures use the dev-gated `/lt/design/text-first` preview because
authenticated dashboard requires a real Supabase session, which this
sandbox cannot create against production. The components rendered are
the production components from the production import paths. PR #30
production mobile smoke remains **PENDING** (owner-only).

## What this evidence does NOT prove

- Authenticated worker UI parity. PR #30 owner-only smoke covers that.
- Active-state behaviour of the role grid when a future role flips to
  active. The guard test enforces the source invariants; the live
  promote-and-walk-through is intentionally one of the next sprints
  (see "Next recommended sprint" in the report).
