# Mobile evidence — feat/cc/role-catalogue-dashboard-surfaces-v1

iPhone 13 (390 × 844, `lt-LT`) Playwright captures against `next start`
of this branch. Source script:
`apps/web/scripts/capture-role-catalogue-mobile.ts`.

## Authenticated production smoke remains PENDING

This evidence comes from the dev-gated `/lt/design/text-first` preview,
which mounts the production `<RoleCatalogueGrid>` server component
from `lib/config/roles.ts`. The components rendered are the production
components from the production import paths.

It is **not** a substitute for the owner-only PR #30 production mobile
smoke, which is still **PENDING** — see
`docs/evidence/post-merge-production-smoke-pr30.md`.

## Files

| # | File | What it shows |
| --- | --- | --- |
| 01 | `01-dashboard-role-catalogue.png` | Top of the new `<RoleCatalogueGrid>` — Darbuotojas rendered as AKTYVU with a single "Atidaryti →" navigating link; Įmonė + Agentūra + Pirkėjas tagged RUOŠIAMA with no link. |
| 02 | `02-account-role-catalogue.png` | Account-style read of the same grid (scrolled). Validates the catalogue is the source for any role surface — not just the worker dashboard. |
| 03 | `03-role-switcher-catalogue.png` | RoleSwitcher header dropdown opened. Same catalogue, same RUOŠIAMA chips, same non-locking intro paragraph (PR #35 hookup preserved). |
| 04 | `04-preparing-role-no-broken-cta.png` | Focus on a preparing role card — RUOŠIAMA chip + "Šis vaidmuo dar ruošiamas. Įjungsime jį, kai bus paruoštas saugiai." reason line. **No navigating button.** |

## Reproducing locally

```bash
pnpm -F web build
cd apps/web && npx next start -p 3001 &
cd apps/web && E2E_BASE_URL=http://127.0.0.1:3001 \
  npx tsx scripts/capture-role-catalogue-mobile.ts
```

PNGs land in `docs/evidence/role-catalogue-dashboard-surfaces-mobile/`.
The preview route 404s if `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` is not
`true`.

## What this evidence does NOT prove

- That an authenticated production worker dashboard renders the new
  `<RoleCatalogueGrid>` identically. The mount itself is a server-side
  React component import; the visible cards in the captures use the
  same component the dashboard does. Live double-check belongs to the
  owner PR #30 smoke.
- Live behaviour of the `<Link>` gate when a future role flips to
  active. Source-level guard ("RoleCatalogueCard renders <Link> only
  inside the active branch", asserting exactly one Link tag) covers
  the static invariant; the live promote-and-walk-through belongs to a
  future sprint when a non-worker role actually ships.
