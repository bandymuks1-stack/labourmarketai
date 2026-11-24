# Owner review — Clickable affordance polish v1

**Provisional owner review before deploy. Final verdict after live walkthrough.**

## Ramūnas feedback (context)
Clear where you are · no unnecessary elements · pleasant background · texts
understandable · would use it · **main issue: not always clear what can be
tapped/clicked.**

## Routes inspected
`/dashboard`, `/dashboard/account`, `/dashboard/profile`, `/dashboard/buyer`,
`/dashboard/company`, `/dashboard/agency`, `/dashboard/journal`.

## What now looks clickable
- The **"Mano erdvės / My spaces"** switch in every room (buyer, company,
  profile, agency, journal) is now an **unmistakable bordered tappable chip**
  (`rounded-md border + hover:bg-brand-blue/10`) — was a plain underline text
  link. Now consistent with the chip already used in the dashboard
  current-space header. Comfortable tap target.
- (Already clear, left as-is:) navigational catalogue cards carry a chevron
  (`→`) + `hover:border-brand-blue` and a CTA button; the worker dashboard
  switch handle is a bordered button (`linkCls`).

## What was confirmed inactive / info-only (no change needed)
- **Preparing role / future-module cards**: flat `border-ink-600 bg-ink-800/30`
  with **no hover** and **no CTA** — info-only, not broken buttons (guard-pinned).
- **Info cards** (manager evidence, worker readiness, profile-CV clarity): static
  `card-border` sections with **no pointer / hover-button** (guard-pinned).

## Text reduction
- No text added. The bordered chip is a self-evident cue, so no explanatory
  helper text was introduced; existing copy left intact (no over-trimming that
  would lose meaning).

## What stayed unchanged
- Room-based IA, the approved background/visual direction, `/dashboard` focus,
  `/dashboard/account` as the only cross-space surface, and all
  buyer/company/profile/agency/journal boundaries (regression-guarded).

## Note (environment)
The local `node_modules` was found pruned mid-session and was restored via
`pnpm install --force` to run validation. No source/lockfile change resulted.

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1405 passed / 102 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/clickable-affordance-polish-v1`
- Base main SHA: `23aba6a`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
