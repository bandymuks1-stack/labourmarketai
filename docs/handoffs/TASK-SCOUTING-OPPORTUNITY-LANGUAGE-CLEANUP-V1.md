# TASK — Scouting / Opportunity Language Cleanup v1

## Goal

After the Contextual Fit Signals / Score Doctrine is merged, clean up risky scoring/scouting language across Labourmarket.ai so the product keeps its premium scouting/draft energy without implying that people, companies, teams, or agencies have one universal value score.

This is a language, UX framing, and safety-governance sprint. It is not a scoring implementation sprint.

---

## Required Starting State

Start only after PR #22 is merged.

Before work:

1. Checkout `main`.
2. Fetch origin.
3. Pull latest `origin/main`.
4. Confirm local `main == origin/main`.
5. Confirm PR #22 merge commit is present.
6. Confirm PR #18 remains open/draft and untouched.
7. Confirm working tree is clean.

---

## Read First

Read:

1. `docs/PRODUCT_CONSTITUTION.md`
2. `docs/CONTEXTUAL_FIT_SIGNALS.md`
3. `docs/DEMO_TO_REAL_DATA_POLICY.md`
4. Current landing/scouting/marketing components and copy.
5. Current dashboard/app copy affected by score/scouting/fit wording.

---

## Product Principle

Labourmarket.ai must never score a person, worker, company, team, agency, or client as having one universal human/business value.

Signals are allowed only when they are contextual and explainable.

Allowed signal families include:

1. Skill / capability coverage against a defined skill set.
2. Fit percentage against a specific search, project, role, need, or opportunity.
3. Extra strengths beyond required criteria.
4. Readiness / proof status based on traceable evidence.
5. Future comparison types only if contextual, traceable, explainable, and human-dignity safe.

Scores/signals must support opportunity discovery, improvement, and experimentation — not human ranking or human-worth judgement.

---

## Owner Intent

The product may use strong scouting, draft, opportunity, and cinematic language.

Do not remove all exciting visuals or make the landing empty.

The goal is not to weaken the product.

The goal is to keep the WOW direction while avoiding language that makes people feel like commodities or universally ranked objects.

---

## Absolute Non-Negotiables

Do not touch:

- PR #18
- Supabase migrations
- RLS/RPC
- production DB
- billing
- payments
- deploy
- DNS
- env
- migration files

Do not add:

- scoring engine
- matching engine
- verification engine
- DB fields
- schema changes
- fake AI
- fake matching
- fake verified skills
- fake ratings
- fake jobs
- fake candidates
- fake companies
- fake real metrics

Do not remove concept visuals merely because real data does not exist yet. Govern them using the Demo-to-Real policy.

---

## Scope

Audit and safely reframe language in:

1. Landing / marketing home.
2. Scouting / draft / opportunity visual sections.
3. Any dashboard/app strings added by PR #20 or PR #21 if they use risky wording.
4. Any docs or copy that mention:
   - `OVR`
   - `overall`
   - `ranked`
   - `score`
   - `rating`
   - `verified`
   - `matching`
   - `live demand`
   - `paklausa`
   - `gyva paklausa`
   - `market score`
   - `profile strength`

---

## Required Reframes

### 1. OVR / overall rating

If `OVR` or one 0–99 universal rating is visible as if real, reframe it.

Preferred alternatives:

- `Fit signal`
- `Readiness signal`
- `Coverage`
- `Proof path`
- `Opportunity fit`
- `Preview signal`
- `Concept fit`
- `Context signal`

If keeping `OVR` as a concept visual, it must be clearly governed as concept/pre-alpha/product-vision and must not imply a real universal person score.

### 2. Ranked / ranking

Avoid language that implies people are globally ranked.

Preferred alternatives:

- `sorted by fit for this need`
- `opportunity-fit order`
- `contextual fit view`
- `review queue`
- `fit direction`
- `candidate review path`
- `people whose abilities may fit this need`

### 3. Verified

Use `verified` only where actual verification exists or the copy clearly says it is future/proof-based.

Preferred alternatives when not real yet:

- `proof-ready`
- `evidence path`
- `confirmation path`
- `can be confirmed`
- `document-supported`
- `manager-confirmed later`
- `preview only`

### 4. Matching

Use `matching` only when real matching exists.

Preferred alternatives:

- `fit direction`
- `opportunity direction`
- `review path`
- `pilot review`
- `possible fit`
- `signal view`
- `manual review`

### 5. Paklausa / demand

Do not use wording that makes people feel like commodities.

Preferred alternatives:

- `galimybės`
- `poreikiai`
- `veiklos kryptys`
- `atitikimo kryptys`
- `darbo rinkos judėjimas`
- `galimybių radaras`
- `poreikių ir pajėgumų signalai`

Demand can remain only in clearly B2B abstract context where it does not describe people as stock or supply.

---

## Demo-to-Real Treatment

For every concept scoring/scouting visual touched, ensure it is one of:

- `concept`
- `sample`
- `preview`
- `real`

Do not relabel concept visuals as real.

A signal becomes real only when:

1. context is defined;
2. evidence source is traceable;
3. algorithm/rule is implemented;
4. output can be explained;
5. product copy says what the signal measures and what it does not measure.

---

## UX Goal

Keep the product exciting.

The user should still feel:

- movement;
- scouting/draft energy;
- premium opportunity system;
- action and direction;
- high-value labour-market OS.

But they should not feel:

- people are meat-market inventory;
- there is one universal person rating;
- the app is pretending to have real matching/scoring before it does;
- companies or workers are judged as one global score.

---

## Implementation Guidance

Make the smallest meaningful copy/component changes.

Do not rewrite the full landing unless necessary.

Prefer:

- label adjustments;
- tooltip/subcopy clarification;
- section eyebrow changes;
- chip labels;
- demo/pre-alpha badges;
- contextual wording.

If a section is too risky to safely fix without a larger redesign, document it as a blocker and leave the code untouched.

---

## Review Artifact

Generate or update a local, gitignored owner-review artifact under:

```text
runtime/review/scouting-language-v1/
```

The artifact should include:

1. Summary of changed terms.
2. Before/after wording table.
3. Screenshots or static render references for affected landing/app sections.
4. Classification of concept/sample/preview/real visuals.
5. Remaining copy risks.

The artifact must look like an owner-review brief, not a giant internal inventory dump.

---

## Validation

Run available checks:

- typecheck
- lint
- build
- placeholders/check or no-fake guard if present
- route/smoke checks if available
- verify all locale JSON parses

If a check cannot be run, state why. Do not fake validation.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Exact files changed.
5. Confirmation PR #22 was merged and used as base.
6. Confirmation PR #18 remained untouched.
7. List of risky terms found.
8. List of terms changed.
9. What was left as concept/pre-alpha and why.
10. Whether `OVR`, `ranked`, `verified`, `matching`, `score`, `paklausa`, and `live demand` remain anywhere visible.
11. Review artifact path.
12. Validation results.
13. Remaining copy/first-impression risks.
14. Confirmation no DB/migrations/RLS/RPC/billing/deploy/env/fake AI/fake matching/fake verification/scoring engine were touched or added.

---

## Recommended Branch Name

```text
feat/cc/scouting-opportunity-language-cleanup-v1
```
