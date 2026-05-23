# Mobile evidence — feat/cc/first-working-beta-variant-v1

iPhone 13 (390 × 844, `lt-LT`) Playwright captures against `next start`
of this branch. Source script:
`apps/web/scripts/capture-first-beta-mobile.ts`.

## Authenticated production smoke remains PENDING

This evidence comes from the dev-gated `/lt/design/text-first` preview,
which mounts the production composers + role switcher + notification
panel with mock data so the real components can be photographed without
a Supabase session.

It is **not** a substitute for the owner-only production mobile smoke,
which is still PENDING — see `docs/evidence/post-merge-production-smoke-pr30.md`.

## Files

| # | File | What it shows |
| --- | --- | --- |
| 01 | `01-dashboard-first-use.png` | Top of the preview page; header chrome + first profile section the way a first-time worker sees it. |
| 02 | `02-profile-text-first.png` | `ProfileTextFirstFlow` with the universal placeholder (customer support / bike repair / led a team / built websites / assembled furniture / documents) and the "Pasiūlykite struktūrą" CTA. Manual picker is a small secondary link. |
| 03 | `03-profile-suggestions.png` | After submitting a sample paragraph — suggestion cards under `Sistema rado`, each with `Patvirtinti` / `Neįtraukti` actions. |
| 04 | `04-journal-text-first.png` | `JournalEntryComposer` with the new universal placeholder (6h, customer support, 12 requests, daily report). |
| 05 | `05-journal-suggestions.png` | Review stage with the explicit "Tai pasiūlymai. Patvirtinkite tik tai, kas teisinga…" intro line above the cards. Time bucket pre-populates `valandos` as the default unit. |
| 06 | `06-account-roles.png` | RoleSwitcher menu open — non-locking rolesIntro paragraph at the top, Darbuotojas AKTYVUS, Įmonė / Agentūra / Pirkėjas tagged `RUOŠIAMA`. |
| 07 | `07-notification-sheet.png` | Notification sheet slid up from the bottom; hero dimmed but visible (portal fix from PR #30 verified). |
| 08 | `08-bottom-nav-cta-clearance.png` | Bottom of the preview — `Open mobile sheet` CTA and surrounding cards sit above the fixed bottom nav. No clipping. |

## Map to sprint Phase 9 expectations

- 01–05 cover the dashboard / profile / journal text-first flows with
  the new universal copy and the explicit "needs your confirmation"
  framing.
- 06 covers the strengthened non-locking role copy.
- 07 verifies the MobileSheet portal still anchors to the viewport on
  mobile after Phase 3 / 6 changes.
- 08 verifies the bottom-nav clearance the guard test enforces.

## Reproducing locally

```bash
pnpm -F web build
cd apps/web && npx next start -p 3001 &
cd apps/web && E2E_BASE_URL=http://127.0.0.1:3001 \
  npx tsx scripts/capture-first-beta-mobile.ts
```

PNGs land in `docs/evidence/first-working-beta-mobile/`. The preview
route is dev-only and 404s if `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` is
not `true`.
