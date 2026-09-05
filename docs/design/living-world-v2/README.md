# Living World v2 — three directions for owner selection

Rendered prototypes, not integrated. **Nothing here touches the landing, and the
landing-freeze baseline has not been regenerated.**

Every screenshot in `review/` is a real Chromium render at 1440×900 (desktop)
and 390×844 (mobile).

## Why the previous attempt was rejected

The first pass built an abstract "strata" background — horizon profiles, depth
blur, parallax. Technically clean, and wrong. A roofline silhouette could be
anything; it read as a dark SaaS hero with decorative lines. **Recognisability,
not polish, was the missing ingredient**, so all three directions below are
built from a shared vocabulary of things that can only be work: tower cranes
with a load on the hook, excavators, forklifts with pallets, racking, sawtooth
factory roofs, hospital beds, kitchen passes with burners, desks — and human
figures at true scale inside all of them (`world-kit.js`).

The test applied to each: **if every word of text disappeared, would this still
unmistakably be a living labour market?**

## A — Living Section  ✅ recommended

One continuous structure carrying every trade at once: under construction on
top (open frame, crane, workers on the slab), four working floors below
(office, care, kitchen, workshop), logistics shipping at its base, city and
green belt behind.

- **No-text test: YES.** Seven distinct workplaces, all inhabited.
- **One economy, not seven scenes** — it is a single object, so the eye reads
  one system rather than a set of vignettes placed near each other.
- **Portrait is native.** A vertical cutaway simply stands taller on mobile.
  `A-mobile.png` is authored at 800×1400, not scaled from the wide frame.

## B — Living City

A continuous working region: skyline, factory sawtooth roofs, logistics hub
with racking and trucks, foreground construction, signals threading across.

- **No-text test: YES.** Reads clearly as an industrial region.
- Good breadth, weaker focal hierarchy — objects are placed rather than
  composed, and the top third is dead sky.
- **Mobile is a crop, not a composition.** A wide region is a landscape idea;
  portrait would need a separate scene authored from scratch.

## C — Infinite Work World

One-point perspective down a working corridor toward a lit horizon, industries
transitioning as they recede.

- **The most cinematic staging** — real depth, and the horizon glow carries the
  "open work economy" feeling better than either other direction.
- **No-text test: PARTIALLY.** It reads as *industrial and night-time* before it
  reads as *a labour market* — the professions are less legible than in A, and
  the corridor itself is a large empty wedge.
- **Mobile is a crop** (`C-mobile.png` shows it plainly), for the same reason
  as B: a receding corridor is inherently landscape.

## Recommendation

**A, with C's horizon light and atmospheric grading folded into it.**

A wins on the only test that matters here — it is unmistakably a labour market
with the text removed — and it is the sole direction whose mobile is a real
composition rather than a crop, which is a structural property of the vertical
cutaway rather than something more effort would fix in B or C.

What A still needs before it goes near the product: floors are left-weighted
with empty right halves, the kitchen extractor reads as a grey pipe, the care
beds are too faint, and the near/far tonal grading is flatter than C's.

## Two bugs the first attempt shipped — do not repeat them at integration

Both were caught by review or by a render, and both will bite again the moment
the selected direction is mounted in a real component:

1. **Stacking.** Every world layer carries a transform and an opacity, which
   makes each one its own stacking context. Anything left at `z-index: auto`
   — including the reading scrim, the travelling signal, and the hero's own
   text — is painted UNDER all of them regardless of DOM order. That is why
   the signal was invisible in four consecutive renders, and why the headline
   and CTA lost contrast the moment a scrim was added. **The content wrapper
   needs an explicit z-index above every world layer.** A CTA that dims into
   its own background is a product regression, not a styling preference.
2. **Capability probing.** `getContext("webgl2", { failIfMajorPerformanceCaveat:
   true })` returning `null` means "not under these conditions", never "this
   device cannot". None of these directions needs WebGL — they are SVG and CSS
   — but the same error shape applies to `deviceMemory`, which Chromium
   reports and Firefox and Safari do not. Absent is not weak; see
   `apps/web/lib/visual/capability.ts`.

## Not done, deliberately

- No landing integration. No freeze-baseline regeneration.
- No product surface, route, copy, CTA or i18n key was touched.
- These are standalone HTML so they cost the product nothing and can be
  deleted in one commit; the winner gets rebuilt as real React components
  against the design tokens.
