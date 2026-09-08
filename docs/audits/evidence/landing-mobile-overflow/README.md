# Landing mobile-overflow evidence — what these images are, and what they are not

The `landing-*.png` files here are frames written by
`apps/web/tests/e2e/landing-mobile-overflow.spec.ts` at 320 / 360 / 375 px.

## Provenance — read this before citing them

**Regenerated 2026-09-07** against the landing rebuilt for owner window
§§16–20 (PR #1609): short topic chips that wrap, the market map, the starting
contexts. They picture the CURRENT layout.

They were produced by:

| | |
|---|---|
| Playwright | 1.62.1 — the same version CI pins |
| Chromium | the build that Playwright version installs, so the same engine as CI |
| OS | **Windows (win32 x64)** — CI runs `ubuntu-latest` |
| Server | a real `next build` + `next start`, not the dev server |

**The layout, the copy and the box geometry are the product's. The font
rasterisation is this machine's.** Text on Ubuntu will hint and antialias
differently, so a pixel diff against a CI-produced frame will not be empty even
when nothing about the product changed. Do not treat these as a visual
baseline; treat them as an accurate picture of the layout.

## Why this file exists

It was written for PR #1608, which proposed a different fix for the same e2e
failure and did not merge. That PR's own reasoning is the reason this file
survived it:

> Regenerating them requires the renderer CI uses. […] re-running the spec here
> would have recorded *this machine's* rendering and committed it as the
> product's — a picture that looks like evidence and is not.

That is right, and it applies to the frames now in this directory: #1609
regenerated them on Windows. The difference between #1608's situation and this
one is only which failure is worse. #1608 chose to keep frames that pictured a
layout **that no longer existed** and say so. #1609 chose frames that picture
the real layout with a renderer that is not CI's, and says so — here.

Both are honest; neither is a baseline. What must never happen is either one
being cited as "how the product renders in CI" without this paragraph.

## How to refresh them on CI's renderer

```
pnpm -F web exec playwright install chromium
pnpm -F web build && pnpm -F web exec next start -p 3000 &
E2E_NO_SERVER=1 pnpm -F web exec playwright test tests/e2e/landing-mobile-overflow.spec.ts
```

Run on `ubuntu-latest` and commit what it writes.

## The assertions do not depend on these images

The spec measures live bounding boxes — the strip, every chip, the submit, the
understanding card, the door links, and `document.scrollWidth`. Deleting every
PNG in this directory would not weaken a single check. They are documentation,
and documentation that disagrees with the product is worse than none, which is
why the disagreement is written down rather than papered over.
