# Product presentation contract v1

How every primary surface in the product communicates. Born from
production findings F3–F5, F7/F8 and F16 (owner used the real product and
found walls of explanatory text, dev markers, and internal vocabulary in
worker-facing UI). This contract is the standing rule; the guard tests in
`apps/web/lib/guards/` enforce the machine-checkable parts.

## The core rule

Every primary surface communicates through:

1. **icon** — instant recognition,
2. **clear number** — the one real count/value, from real data,
3. **short human label** — words a worker on a construction site uses,
4. **visual state** — colour/badge/progress that reads at a glance,
5. **one direct action** — the single obvious next step.

Long explanations are NEVER inline on a primary surface. They live only
behind a `?` affordance, a tooltip, a disclosure ("Rodyti daugiau"), or a
docs page. If a card needs a paragraph to justify itself, the card is
wrong, not the paragraph.

## Passive vs interactive states

- Every button-like element MUST open its exact object. A card that looks
  clickable and does nothing (F2's team rows) is a defect, not a style.
- Passive information gets NO button affordance: no hover lift, no
  pointer cursor, no chevron. The visual grammar must match reality.
- A disabled control must say in one short line WHY it is disabled and
  what unlocks it — never a bare grey button.

## Empty states

One compact honest line + at most one CTA. Examples of the shape:

- "Nuotraukų dar nėra." + [Pridėti įrašą]
- "Projektų priskyrimų dar nėra." (no CTA when the user cannot act)

Never: multi-paragraph explanations of what the module WILL do, module
self-descriptions, or promises about future data.

## Banned vocabulary in primary UI

The following may not appear on any worker/company-facing primary
surface (guard-enforced where marked):

| Banned | Why | Guard |
|---|---|---|
| "gyvi duomenys" | marketing claim about data, not information | `product-copy-forbidden-terms.test.ts` |
| "signalai" (as internal concept) | internal evidence vocabulary leaked to users (F7/F8) | copy guards + skills-truth contract |
| "tiesioginiai duomenys" | same class as "gyvi duomenys" | copy guards |
| "vietos rezervavimo" | placeholder-reservation jargon | copy guards |
| "placeholder" / dev markers | F4 — dev artefacts in production | `placeholder-marker-prod.test.ts`, `placeholder-sample-affordance.test.ts` |
| "modulis skirtas..." | module self-description instead of content | copy guards |
| agent/architecture explanations | users buy outcomes, not architecture | `architecture-copy.test.ts` |

The full guard family lives in `apps/web/lib/guards/` (see also
`product-copy-forbidden-terms.test.ts`, `public-product-copy.test.ts`,
`worker-facing-copy-exhaustive.test.ts`,
`no-user-facing-missing-backend-copy.test.ts`). F16's sweep extends this
list; new banned terms get a guard, not just a fix.

## Numbers must be true and labelled

A number on a card derives from a real query and states WHICH population
it counts (F9's "19 vs 2" came from two unlabelled populations). See
`docs/launch/skills-truth-contract-v1.md` for the skills instance of this
rule; it applies to every count in the product (photos, projects,
notifications).

## Honest degradation

When a backing table/service is not yet activated (e.g. the owner-gated
`company_locations` table), the surface shows one honest line — prepared,
activation pending — never a fake empty list and never a crash. 42P01
detection in `lib/company/company-locations.ts` is the reference
implementation.

## Header and chrome

Header controls are icon-first (F5): role indicators and theme controls
are compact icons with tooltips, not text pills. The public site carries
the same theme toggle (`components/ui/theme-toggle-icon.tsx`) as the app.

## Applying this contract

- New surface → design to the five-part rule first; prose second.
- Review question: "can a worker with gloves on, outdoors, in 3 seconds,
  know what this is and what to press?"
- Any exception must be justified in the PR description and covered by a
  guard-test allowlist entry, never silently.
