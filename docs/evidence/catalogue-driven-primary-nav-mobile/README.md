# Mobile evidence — feat/cc/catalogue-driven-primary-nav-v1

iPhone 13 (390 × 844, `lt-LT`) Playwright captures against `next start`
of this branch. Source script:
`apps/web/scripts/capture-catalogue-nav-mobile.ts`.

## Authenticated production smoke remains PENDING

This evidence comes from the dev-gated `/lt/design/text-first` preview,
which mounts the same `BottomNav` component the real dashboard does.
The capture is to show that the catalogue-driven nav renders the same
four tabs (Apžvalga / Profilis / Žurnalas / Mano paskyra) the
authenticated dashboard rendered before this PR. It is **not** a
substitute for the owner-only PR #30 production mobile smoke, which is
still **PENDING** — see `docs/evidence/post-merge-production-smoke-pr30.md`.

## Files

| # | File | What it shows |
| --- | --- | --- |
| 01 | `01-bottom-nav-tabs.png` | Bottom of the preview with the four tabs rendered from `VISIBLE_PRIMARY_NAV_ITEMS` — Apžvalga, Profilis, Žurnalas, Mano paskyra. |
| 02 | `02-bottom-nav-overview-active.png` | Same view — preview route is not `/dashboard` so no tab is highlighted, but the four-tab layout, icons, and labels are identical to PR #36. |
| 03 | `03-feature-grid-and-nav.png` | Feature catalogue grid (preparing rows with `RUOŠIAMA` chips + reason lines) above the bottom nav. The nav itself is sourced from the same catalogue. |
| 04 | `04-bottom-nav-clearance.png` | Bottom-of-page region — the nav clears feature-grid cards. No clipping, no horizontal overflow. |

## Reproducing locally

```bash
pnpm -F web build
cd apps/web && npx next start -p 3001 &
cd apps/web && E2E_BASE_URL=http://127.0.0.1:3001 \
  npx tsx scripts/capture-catalogue-nav-mobile.ts
```

PNGs land in `docs/evidence/catalogue-driven-primary-nav-mobile/`. The
preview route 404s if `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` is not
`true`.

## What this evidence does NOT prove

- That an authenticated production worker sees the same nav. That is
  the owner-only PR #30 smoke. The refactor is source-only and
  mechanically equivalent — the visible nav is byte-identical to PR #36
  (same labels, same routes, same icons, same order).
- Active-state highlighting. The preview route is not in
  `VISIBLE_PRIMARY_NAV_ITEMS`, so no tab is highlighted in these shots.
  Behaviour is verified by the existing `aria-current` logic in both
  `BottomNav` and `DashboardTabs`, which the refactor leaves untouched.
