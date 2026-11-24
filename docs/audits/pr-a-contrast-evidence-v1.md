# PR-A — Visual A11y Polish: Contrast + Label-Floor Evidence

**Branch:** `feat/cc/pr-a-contrast-a11y` (off `main` @ 77e16c9).
**Scope:** token-only contrast lift + sub-floor label-size bump. No product
logic, no DB/migrations, no auth/env/secrets/billing, no fake data, no deploy.
**Implements:** PR-A from `docs/audits/visual-product-quality-audit-v1.md`
(P0-1 / P0-2 / part of the label-floor item).

## What changed

### 1. `--c-text-muted` contrast lift (the P0-2 fix)
The pervasive 10–11px mono labels use `text-muted`. The old value passed AA on
the base background but **failed AA (< 4.5:1) on the lighter `ink-800` card and
tinted panels** where many of those labels actually sit.

| Surface | Old ratio | New ratio | AA 4.5:1 |
|---|---|---|---|
| DARK muted on `ink-900` (page) | 4.56 | **6.29** | ✅ (was ✅, now strong) |
| DARK muted on `ink-800` (card) | **4.39 ❌** | **6.06** | ✅ fixed |
| DARK muted on `ink-700` (inset) | **4.20 ❌** | **5.79** | ✅ fixed |
| LIGHT muted on light page bg | 4.86 | **6.08** | ✅ |
| LIGHT muted on light card (white) | 5.25 | **6.57** | ✅ |

- Dark: `110 120 146` → `134 144 168`.
- Light: `99 108 130` → `84 93 116`.
- **Hierarchy preserved:** dark `text-secondary` (unchanged) is 7.97:1 on
  ink-900, still above muted's 6.29 — the primary/secondary/muted ramp is
  intact. `text-primary` is untouched (and is pinned by the design-tokens
  guard, which stays green).
- Ratios computed with the WCAG relative-luminance formula (sRGB, 2.4 gamma).

### 2. Sub-floor label size bump
Raised the 21 `text-[9px]` occurrences (12 files) to the project's `text-[10px]`
floor so no on-screen label renders below 10px. This is the safe, consistent
slice of the audit's "raise tiny label floor" item — a mechanical
size-token swap, no layout or logic change. (The broader 10px→12px floor across
446 sites is intentionally deferred; see "Deferred" below.)

## Files changed (13)

- `apps/web/app/globals.css` — 2 token values (dark + light `--c-text-muted`).
- 12 component/page files — `text-[9px]` → `text-[10px]` only:
  admin `users/[id]/page.tsx`, `capability-profile-section`,
  `cv-engagement-cards`, `dashboard-section`, `notification-panel`,
  `org-members-panel`, `profession-skills-picker`, `profile-cv-clarity-card`,
  `role-switcher`, `worker-trade-profile`, `locale-switcher`, `ui/Placeholder`.

Diff is exactly 23 insertions / 23 deletions — every changed line is a token
value or a `[9px]→[10px]` swap; no other content touched.

## Validation (all green)

| Check | Result |
|---|---|
| `pnpm -F web typecheck` | exit 0 |
| `pnpm -F web lint` | exit 0 (1 pre-existing unrelated warning in a guard file) |
| `pnpm -F web build` | exit 0 — all routes compiled |
| `design-tokens` guard | 15/15 pass |
| 9 guard suites touching changed components | 154/154 pass |

## Owner-review visual evidence

Numeric contrast proof is in the table above (measured, not eyeballed). A
pixel screenshot pass was **not** run in this slice (the change is a token value
+ font-size floor with no layout reflow). To capture before/after visuals,
run the `playwright-skill` plan from the audit (§2) on `/lt/dashboard`,
`/lt/dashboard/profile`, `/lt/dashboard/inbox` at 390/768/1440 in dark + light.
The visible effect is uniformly: muted mono labels become more legible; nothing
moves or resizes beyond the 9→10px labels.

## Deferred (not in this PR — honest scope)

- **10px/11px → 12px floor across the remaining ~425 sites / ~100 files.** This
  is a large reflow-risk refactor, not a token-only change, so it is **not**
  bundled here. Recommended as its own follow-up PR with screenshot diffing.
- All other audit items (tap targets, focus-offset, secondary-action unification,
  company cockpit hierarchy, icon system) remain in the audit backlog.

## Safety proof

- No product logic, no DB/migrations, no auth/env/secrets/billing changes.
- No fake data introduced.
- Isolated git worktree off `main`; the concurrent session's branch was never
  touched.
- **Not merged.** Goal requires owner approval before merge — no auto-merge
  enabled.
