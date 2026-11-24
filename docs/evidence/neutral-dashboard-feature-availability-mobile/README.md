# Mobile evidence — feat/cc/neutral-dashboard-feature-availability-v1

iPhone 13 (390 × 844, `lt-LT`) Playwright captures against `next start`
of this branch. Source script:
`apps/web/scripts/capture-neutral-dashboard-mobile.ts`.

## Authenticated production smoke remains PENDING

This evidence comes from the dev-gated `/lt/design/text-first` preview,
which mounts the production composers + role switcher + notification
panel + the new `<FeatureAvailabilityGrid>` (server component) with mock
data. It is **not** a substitute for the owner-only PR #30 production
mobile smoke, which is still **PENDING** — see
`docs/evidence/post-merge-production-smoke-pr30.md`.

## Files

| # | File | What it shows |
| --- | --- | --- |
| 01 | `01-dashboard-neutral-first-use.png` | Top of the preview page — universal first-use intent, no worker-only language above the fold. |
| 02 | `02-dashboard-active-ctas.png` | The active text-first composer (active feature path), with the explicit "Pasiūlykite struktūrą" CTA and the secondary "Pridėti rankiniu būdu" manual link. |
| 03 | `03-dashboard-preparing-card.png` | The new config-driven `<FeatureAvailabilityGrid>` rendering preparing features (Išorinis patvirtinimas / Įmonės erdvė / Agentūros erdvė / Pirkėjo erdvė / Dokumentų įrašai …) each with the `RUOŠIAMA` chip + the "Ši galimybė bus įjungta vėliau." reason line. **No navigating CTA on any preparing card.** |
| 04 | `04-account-roles-config-driven.png` | RoleSwitcher open — worker Aktyvus, Įmonė / Agentūra / Pirkėjas tagged `RUOŠIAMA`. The list iterates over `LABOUR_MARKET_ROLES` via `ROLE_BY_ID`. |
| 05 | `05-bottom-nav-clearance.png` | Bottom of the preview — feature grid rows clear the fixed bottom nav. No clipping. |

## Reproducing locally

```bash
pnpm -F web build
cd apps/web && npx next start -p 3001 &
cd apps/web && E2E_BASE_URL=http://127.0.0.1:3001 \
  npx tsx scripts/capture-neutral-dashboard-mobile.ts
```

PNGs land in
`docs/evidence/neutral-dashboard-feature-availability-mobile/`. The
preview route is dev-only and 404s if
`NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` is not `true`.

## What this evidence does NOT prove

- That an authenticated production worker sees the same UI. That is the
  owner-only PR #30 smoke (`docs/evidence/post-merge-production-smoke-pr30.md`).
- That the `<FeatureAvailabilityGrid>` shows the same set of cards on
  the worker dashboard at `/dashboard` vs the company / agency cockpit
  branch — both routes mount the grid; the only difference is whether
  `profile_text_first` + `journal_text_first` are excluded (worker
  excludes them because they appear as their own canonical cards
  higher on the page). Source review confirms; live double-check
  belongs to the production smoke.
