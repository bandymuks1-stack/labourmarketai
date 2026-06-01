# Owner review — Mobile-first room polish v1

**Provisional owner review before deploy. Final verdict after deploy.**

> Note: the referenced spec file `docs/agent-goals/mobile-first-room-polish-v1.md`
> was not present on disk. This slice executes the inline `/goal` directive:
> after the room-based IA reset, each page must feel like one clear room on
> mobile — current space + primary action + only that space's cards — not a
> compressed desktop dashboard. CSS/layout only.

## Problem summary
After PR #204 the dashboard is already a focused room, but two desktop-shaped
elements still read as "compressed desktop" on a phone:
1. the journey rail showed a row of 4 labelled circles — the uppercase,
   letter-spaced labels cram under tiny circles on a narrow screen;
2. the room's primary action (pilot CTA) was a small, left-aligned `size="sm"`
   button — not an obvious mobile tap target.

## Fix (CSS/layout only)
1. **Journey rail (mobile):** per-step labels are now **hidden on mobile**
   (`hidden … sm:block`); the circles remain, and a single **current-step line**
   (`sm:hidden`, `data-testid="journey-current-step"`) is shown below — so the
   phone shows one clear "you are here" step instead of 4 crammed labels.
   Desktop (≥640px) is unchanged.
2. **Primary action (mobile):** the pilot CTA is now **full-width on mobile**
   (`w-full sm:w-auto sm:self-start`) — a clear primary tap target, compact at
   sm+.

No structural/logic change: the rail still renders the same accessible
`<nav aria-label>` over all stages; the button still does the same action.

## Before → after (mobile)
| Element | Before | After |
|---|---|---|
| Journey rail | 4 crammed uppercase labels under tiny circles | circles + one clear current-step line; labels return at ≥640px |
| Primary CTA | small left-aligned button | full-width tap target on phones |

## Routes affected
- `/[locale]/dashboard` (journey rail; pilot primary CTA on the company/agency cockpit)

## Known limitations
- This is a targeted polish, not a redesign. Deeper per-space mobile treatments
  (e.g. sticky primary action, per-room mobile spacing tokens) are future work.

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1378 passed / 100 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/mobile-first-room-polish-v1`
- Base main SHA: `30ff0a5`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
