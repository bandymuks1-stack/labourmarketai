# Landing mobile-overflow evidence — what these images are, and what they are not

The `landing-*.png` files in this directory are frames written by
`apps/web/tests/e2e/landing-mobile-overflow.spec.ts` at 320 / 360 / 375px.

## They are STALE as of 2026-09-07

They predate the chip-strip fix in this directory's own subject area:

* #1606 turned the ten example chips into a horizontal scroller below `sm`;
* this change capped each chip at the strip's visible width so its sentence
  wraps instead of running 398px wide on a 320px phone.

So the frames still show `whitespace-nowrap` chips running off the right edge.
**The layout they picture no longer exists.**

## Why they were not regenerated here

Regenerating them requires the renderer CI uses. The container this fix was
written in carries a different Chromium build, so re-running the spec here
would have recorded *this machine's* rendering and committed it as the
product's — a picture that looks like evidence and is not.

That is the same failure the 2026-09-07 reconciliation found across the
repository (§3.7): a stale artifact read as a current fact because nothing
said otherwise. This file is what says otherwise.

## How to refresh them honestly

Run the spec on the same browser build CI pins, from a clean `next build`,
and commit the frames it writes:

```
pnpm -F web exec playwright install chromium
pnpm -F web build && pnpm -F web exec next start -p 3000 &
E2E_NO_SERVER=1 pnpm -F web exec playwright test tests/e2e/landing-mobile-overflow.spec.ts
```

The assertions do not depend on these images — the spec measures live boxes.
They are documentation, and documentation that disagrees with the product is
worse than none, which is why the disagreement is written down here rather
than papered over.
