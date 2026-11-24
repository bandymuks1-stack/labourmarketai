# ANTI-AI-SLOP REVIEW CHECKLIST (owner directive 2026-09-16, §17–§18)

Status: **BINDING for every PR that adds or changes a user-facing surface.**
The objective half lives in `apps/web/lib/guards/product-ia-anti-slop.test.ts`
(dead doors, hub regrowth, chat→canonical import, import prerequisites,
preview-before-commit, fixture leakage, LT copy, week/date determinism). This
document is the half a file cannot prove. A reviewer answers it in the PR
description; "n/a" is an answer only with a reason.

## A. The rejection test (ask first)

Remove the logo, the brand name and the marketing copy from the screen.

> **Could this interface plausibly belong to almost any generic AI/SaaS
> startup?**

If YES → reject. Identity must come from the interaction model: PERSON ↔
CAPABILITY ↔ EVIDENCE ↔ WORK ↔ TIME ↔ PROJECT/SITE ↔ TEAM ↔ DEMAND ↔
EMPLOYER/CLIENT ↔ OPPORTUNITY ↔ COMMITMENT ↔ OUTCOME ↔ NEXT OPPORTUNITY.

## B. Before UI (the eight questions, §18)

1. What real-world object or process is this?
2. Where does it belong in the existing LabourMarket.ai world (which §14 node, which journey)?
3. What existing door / context exposes it? (Organization doors: Dabar · Žmonės · Darbai · Poreikiai · Kalendorius · Klientai/Partneriai · Mokymai · Istorija · Nustatymai. Worker: ŠIANDIEN · PASAULIS · PAKLAUSK + stations.)
4. What can the system infer or prepare instead of asking the human?
5. What genuinely requires a human decision (rule §5 A–E: not inferable · materially different readings · legal/consent · consequential commitment · genuine evidence conflict)?
6. What evidence / provenance is required, and is FACT ≠ DERIVED ≠ FORECAST visible?
7. Does it introduce a generic SaaS surface (title → prose → KPI cards → prose → stacked panels)?
8. Does it duplicate an existing capability, route, component or data model?

A feature that cannot answer these is not ready for UI.

## C. Screen-level checks

- [ ] First level answers only: WHAT IS HAPPENING · WHAT NEEDS ME · WHAT CAN I DO · WHERE CAN I GO. Deeper detail is behind a door or on request.
- [ ] No "paklodė": the screen is not a vertical dump of every capability of its domain.
- [ ] Every number that is interactive is an operational entry point; every number that is not, is a sentence, not a tile.
- [ ] Objects are doors: person → identity/work history/availability; project → people/stages/time/evidence; demand → people/capabilities/location/time/matching; team → capacity/assignments; client → demand/projects/history; calendar → commitments/clashes; work history → evidence/journal/provenance.
- [ ] No in-page anchors pretending to be navigation across domains.
- [ ] No engineering prose in persistent copy (how prioritisation is implemented, "no AI is used", state-machine words, QA/E2E identifiers). Guarantees stay — in `<details>`, help, audit or provenance.
- [ ] Product-owned copy is in the active locale; user-entered data is never translated to satisfy the locale.
- [ ] UNKNOWN ≠ ZERO ≠ FAILED ≠ NOT_MEASURED are distinguishable states.
- [ ] Phone width: current context → current action → relevant doors → deeper spaces; no giant sidebar behind a hamburger.
- [ ] Icon doors carry a text label; state is never colour alone; ≥ 44 px targets.

## D. Workflow-level checks

- [ ] The chat intent for this job opens or PREPARES the canonical context (no dead-end chip).
- [ ] The human is never asked to satisfy a data-model prerequisite the evidence already answers ("first create an object").
- [ ] Nothing is written before an explicit commit; the preview says WHAT WAS FOUND · WHAT EXISTS · WHAT WILL BE CREATED · WHAT WILL BE LINKED · WHAT LOOKS WRONG · WHAT NEEDS A DECISION.
- [ ] Contradictory evidence is preserved, detected, compared, explained — never silently rewritten.

## E. What this checklist does NOT license (§15)

No frontend rewrite, no new design system, no duplicate routes/components/models, no second dashboard framework, no gradients/glassmorphism/AI animation, no agent-per-screen, no deletion of mature functionality because it is hard to organise. CONNECT → FIX → EXTEND → NEW.

## F. Evidence

Human visual proof remains human proof. A PR may claim TEST_PROVEN or
PRODUCTION_DATA_PATH_PROVEN from files and walks; HUMAN_UI_PROVEN is written
only by the person who looked.
