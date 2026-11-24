# Landing-freeze baseline update — 2026-08-09 (PR #1100)

The landing freeze (`apps/web/lib/guards/landing-freeze.ts`) hashes the landing
render tree and fails CI on any drift. Regenerating its baseline is an
owner-gated act. This file records one such regeneration so it stays auditable
and trivially revertible.

## What moved

Exactly one hash, and nothing else:

```
components/marketing/hero-live-demo.tsx
  5be78a29ac17fce2a0131581fa2b678079a9756c63b264cd3a12c4862a25598b  (before)
  bba95221644db253bf9e2ef231e0a165c6af2392c10b44d352f052135abc5c0d  (after)
```

- 0 other frozen files changed.
- 0 frozen i18n namespaces changed (lt/en/ru × 9 namespaces all identical).

Verify with `git show <this commit> -- apps/web/lib/guards/landing-freeze-baseline.json`:
the diff is a single line.

## Why the file changed

Two edits to `hero-live-demo.tsx`, both in PR #1100:

1. `w-0` added to the hero ask `<input>`'s class list.
2. `data-testid="hero-map-hint"` added to the map-caption `<p>` so the
   Playwright spec can measure that element's box.

## Why this is not a landing redesign

The freeze exists so that no PR outside the landing plan changes **what the
landing renders**. This one does not.

The input already carries `flex-1` (`flex: 1 1 0%`). Adding `w-0` changes only
the element's *min-content contribution* during intrinsic sizing — from ~205px
(the `<input>`'s `size`-based intrinsic width, which `min-w-0` does not remove)
to 0. `flex-1` still grows the field to fill its row, so the painted result is
identical at every viewport the freeze was protecting.

At 320px it is not identical, and that is the point: before this change the
hero grid track was sized 325px inside a 272px container, which pushed the map
column, the "Demonstracija" badge and the map caption out to x=349 on a 320px
viewport. `html { overflow-x: hidden }` then **clipped** that 29px rather than
scrolling it, so the right edge was silently cut off on the narrowest phones
still in real use.

The second edit adds a test hook and renders nothing.

## Why the baseline was regenerated instead of routed around

Every element in the hero's render tree is frozen, so there is no in-tree way
to fix the intrinsic width. The only alternative was an override in unfrozen
CSS (e.g. `[data-testid="hero-ask-input"] { width: 0 }` in `globals.css`).
That was rejected: it produces the same pixel but depends on cascade order
against Tailwind's utility layer, so it can break silently later. A
tester-facing layout fix should not rest on a specificity accident.

## Reverting

Restore the `before` hash above in
`apps/web/lib/guards/landing-freeze-baseline.json` and revert PR #1100. The
landing returns to its previous bytes, and to its previous 320px clipping.

## Evidence

- `apps/web/tests/e2e/landing-mobile-overflow.spec.ts` — measures element
  bounding boxes at 320/360/375, not `documentElement.scrollWidth` (which
  reported a clean 320 on the very page that was 349px wide, because
  `overflow-x: hidden` hides the defect from that API).
- `docs/audits/evidence/landing-mobile-overflow/` — screenshots at each width.
- Local run with this baseline: guards project 642 files / 11332 tests green.
