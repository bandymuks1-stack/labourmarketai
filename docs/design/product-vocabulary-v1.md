# Product vocabulary v1 — one visual language for the work graph

Status: first slice implemented (2026-10-04). Order of work, by owner direction:
**product truth → design system → interaction/motion language → cinematic amplification.**
The cinematic film (`docs/product/CINEMATIC_FILM_ARCHITECTURE_V1.md`, branch
`feat/cc/cinematic-film-v1`) is paused until this vocabulary is the product's own
language; it must then reuse these shapes rather than invent others.

## What already existed (and is extended, not replaced)

`components/app/work-world/` — the owner-accepted "Living Work World" grammar
(2026-09-18): the cyan spine with a diamond per record, `EvidenceState`,
`EvidenceChain`, `PersonPresence`, `CapacityBand`, `PeriodBand`. Its
`primitives.tsx` is **frozen with the landing** (`landing-freeze.ts`), so it cannot
change without an owner-approved baseline regeneration. v1 therefore *adds beside it*:

| New | Extends | Why it could not be done in the old file |
|---|---|---|
| `state-mark.tsx` `StateMark` / `StateGlyph` / `workStateOfStanding` | `EvidenceState` chip | Shape **and** word in sentence case; one bridge from `EvidenceStanding` keeps the colour rule (`evidenceVariant`) defined once |
| `spine.tsx` `Spine` / `SpineItem` | `WorkSpine` / `WorkSpineNode` | Same cyan thread + diamond, plus **position in time**: `now`, `past`, `next` (not yet history), `gap` (unknown ≠ zero) |
| `capability-tag.tsx` | skill chips in CV/journal | One tag for a capability and **what stands behind it** (confirmed / evidence / declared) |
| `relation-rail.tsx` | the doc-comment chain | Shows which links of work → evidence → confirmed → history → next are *true for this person* |
| `work-bar.tsx` | `PeriodBand` | Volume with honest layers; never a zero-length bar for "no records" |

## Rules the vocabulary encodes (guarded by `product-vocabulary.test.ts`)

1. A state is **shape + word**, never colour alone.
2. **Confirmed is green and only for a second party** (gold = brand/waiting; BRAND ≠ CONFIRMATION; self-attested is never green).
3. **UNKNOWN ≠ ZERO**: its own state and its own node (`gap`), never a short bar.
4. A rail link is `done` only when the record behind it exists; it maps what the data knows, never a progress bar to fill.
5. Sentence case in the product; mono is for numbers, ids and stamps.

## Label grammar (system-wide, one rule)

`.lm-product` (the dashboard layout wrapper, `display: contents`) turns every
`uppercase tracking-label font-mono` label inside the signed-in product into a
sentence-case label in the UI face. One CSS rule moves hundreds of labels; the public
site and the frozen landing are untouched.

## Surfaces migrated in v1

* **Living CV** (`cv/living-cv-story.tsx`): identity header, relation rail, spine of engagements with work bars, "next — not history yet", capability tags by evidence tier.
* **Work Journal day** (`journal/journal-day-object.tsx`): the day is one causal thread (place → work → time → proof → confirmation → history), not six boxes.
* **Evidence chain**: words are sentence case at the 12px floor.
* **Today**: portrait + identity header.

## Next (Phase 2 — propagate)

Page frame (one title/purpose/actions/left-edge for ~70 dashboard pages), profile hub,
opportunities and need↔supply, match and conversation → agreement, company project
operations, then motion: *new evidence → history changes*, *match → relationship state*
(the transitions the film will later amplify).
