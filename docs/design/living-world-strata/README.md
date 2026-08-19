# THE STRATA — labourmarket.ai visual identity

**Slice A of the Living World visual train. Foundation only: the world system
exists and is proven in a browser; nothing is mounted on a product surface yet.**

## The decision

Neither of the two sketched directions was taken literally. A cross-section
("pjūvis") drawn as a picture and a station hall ("stotis") are both *images
you scroll past*. What this product needs is a world it visibly lives inside,
because its whole claim is that work is one connected system — and a column of
stacked cards argues the opposite with its shape alone.

So: **the page IS the section.** A continuous vertical cut through the working
world, seven strata deep, with content sitting inside it and a demand signal
travelling the full depth.

A station was rejected for a specific reason, not a stylistic one: it is a
wide-format idea. It composes at 1440px and collapses at 390px. A vertical cut
is natively portrait, so mobile keeps the Living World rather than a postcard
of it.

## Why the world is dark while the product is light

Two renders settled this. Filled layers on the light page read as coloured
slabs; the same layers at honest low alpha vanished into the white. Both have
one cause — a cross-section of the working world is lit **from within**, and
material light needs dark air to be light against. On white there is no glow,
only a stain.

`.world-night` re-declares the token channels for its own subtree using the
names the dark theme already defines. The light product default is untouched
everywhere else, and text inside the section resolves to the audited
dark-theme foreground automatically.

## Why not WebGL

A parallax cross-section is layered 2D. Every property it needs — blur, scale,
opacity, translation — is a compositor property the browser already
accelerates. A GPU context buys nothing here, costs a renderer plus a fallback
path, and adds context-loss and driver-blocklist failures to a page whose job
is to load fast for a worker on a phone.

## What it took — the honest record

Eight renders. Six failed for reasons that were checkable in code, not matters
of taste, and every one is now pinned by
`lib/guards/living-world-visual-system.test.ts`:

| # | What was wrong | Why |
|---|---|---|
| 1 | Stacked coloured slabs, content buried under them | Layers filled to a flat bottom edge — two hard edges per layer and the eye counts objects instead of reading depth |
| 2 | Invisible ghost | Overcorrected the alpha; on a light ground there was nothing left |
| 3 | Depth read, but the frame was empty black | A night scene with no emitter — darkness is what light is measured against, not a mood on its own |
| 4 | Top 40% crushed to black | Three darkening layers were stacking: atmosphere, a radial scrim and a top band |
| 5 | Near layers pinned to the top of the frame | Depth ordering inverted — vertical position reads as distance before anything else does |
| 6 | Inverted a second time | `STRATA.length - 1 - index` silently re-flipped it; the mapping is now written plainly |
| 7 | Mobile showed ~a quarter of each profile | `slice` at 390px turns horizons into abstract blocks — the "shrunken desktop" failure |

`review/` holds the before/after pairs for the desktop rebuild and the mobile
recomposition.

## What is NOT claimed

- Nothing is mounted on the landing or any product surface. The landing is
  under an owner-gated freeze; applying the world there is a separate,
  explicitly-gated act.
- No product copy, CTA, route, auth semantics or governed number is touched.
- The world is `aria-hidden` and carries no information that is not also
  stated in real text elsewhere — which is the test for whether a decorative
  background is honest.
