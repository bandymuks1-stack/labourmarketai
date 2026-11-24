# Role Catalogue Driven Dashboard Surfaces Audit v1

> **Type:** rigidity audit for remaining dashboard role surfaces.  
> **Base:** `main` @ `93bfa46` (PR #37 merged).  
> **Branch:** `feat/cc/role-catalogue-dashboard-surfaces-v1`.  
> **Method:** source review + central-config inventory + guard tests.
> Authenticated production smoke remains **PENDING**.

This sprint resolves the "role catalogue is not yet driving dashboard
role surfaces" item flagged at the end of PR #37's report. After this
PR, role expansion on the dashboard is generated from
`lib/config/roles.ts`.

## Findings

| # | Question | Score | Evidence |
| --- | --- | --- | --- |
| 1 | Which dashboard cards still carry role lists outside `roles.ts`? | PASS | The worker dashboard's old hardcoded `addMore` card has been replaced with the new `<RoleCatalogueGrid>` mounted from `getVisibleRoleOptions()`. A small reminder strip pointing at `/dashboard/account` remains, but it carries no role list — only the existing `auth.dashboard.wow.addMore.body` line + a single navigation CTA. |
| 2 | Which role labels / descriptions are still duplicated? | PASS | Catalogue rows declare `labelKey: "auth.signup.role.<id>"` (short label, reused by RoleSwitcher / account) and `descriptionKey: "roles.<id>.description"` (long description, new namespace). Future role rows reuse the same scheme — no scattered raw text. |
| 3 | Which role-related CTAs are real today? | PASS | Only the worker role renders a navigating `<Link>` (`/dashboard`). The guard test ("RoleCatalogueCard renders <Link> only inside the active branch") enforces it. |
| 4 | Which role-related CTAs are preparing only? | PASS | Company / Agency / Customer rows render the `RUOŠIAMA` chip + `roles.preparingReason.default` line and NO link. Freelancer / Team lead / Service provider stay `availability: "hidden"` so they're not rendered at all today. |
| 5 | Which components should consume `LABOUR_MARKET_ROLES` / `ROLE_BY_ID`? | PASS | `RoleSwitcher` (PR #35), `/dashboard/account` page (PR #35), worker dashboard role expansion section (THIS PR via `RoleCatalogueGrid`), `RoleCatalogueCard` (THIS PR). |
| 6 | Which role surfaces must remain active for first beta? | PASS | Worker only. RoleSwitcher header dropdown stays available (with preparing chips on non-worker rows). `/dashboard/account` shows the user's existing roles. Worker dashboard surfaces stay worker-leaning by design (route IS worker-only). |
| 7 | Which role surfaces must be preparing or disabled? | PASS | Company / Agency / Customer roles render preparing chips wherever they appear (RoleSwitcher, account list, RoleCatalogueGrid). Freelancer / Team lead / Service provider stay hidden. Switching to a non-worker role still works server-side (data layer is unchanged) but the destination is the pilot cockpit, which itself is honestly preparing. |
| 8 | What is the minimum safe catalogue-driven renderer? | PASS | `apps/web/components/app/role-catalogue-card.tsx`: receives a `LabourMarketRole`, looks up label + description + status via i18n, gates `<Link>` on `isActive && primaryRoute`, falls back to preparing chip + reason line. Bridges to feature catalogue via `isFeatureActive(role.primaryFeatureKey)` so a role can't masquerade as active while its underlying feature is preparing. |
| 9 | Which tests should prevent future drift? | PASS | +9 vitest assertions: required role-id coverage, only `worker` active, helpers exposed, Link gated, dashboard mounts the grid, RoleSwitcher + account still consume catalogue, labels + descriptions are i18n keys (not raw text), LT + EN expose every role.* key, non-locking promise present. The PR #36 / #37 guards "matching/marketplace hidden", "feature catalogue coverage" and "no new migration files this sprint" still hold. |
| 10 | Can a user still understand they are not locked into one role? | PASS | The grid renders the `roles.nonLockingIntro` paragraph above the role rows ("Jūsų pradinis vaidmuo nėra apribojimas…" / "Your first role is not a limit…"). The same wording surfaces inside the RoleSwitcher menu (PR #35) and on the account page (PR #35) — three reinforcing places, all from the same i18n catalogue. |

## Companion files

- `docs/evidence/role-catalogue-dashboard-surfaces-v1.md` — surface ×
  source × CTA × risk × status table.
- `docs/evidence/role-catalogue-dashboard-surfaces-mobile/` — 4 iPhone
  13 captures of the new surfaces.
- `docs/product/role-catalogue-driven-surfaces-v1.md` — the doctrine
  this audit scores against.
- `apps/web/lib/config/roles.ts` — catalogue + helpers.
- `apps/web/components/app/role-catalogue-card.tsx` — shared renderer.
