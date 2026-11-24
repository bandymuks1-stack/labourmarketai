# TASK — Public Beta Hardening v1

## Goal

Turn the current CONDITIONAL GO into a safer limited closed-beta GO for Labourmarket.ai.

This sprint must fix or verify the P0 blockers from `docs/audits/PUBLIC-BETA-READINESS-AUDIT-V1.md` and address the most important P1 readiness issues without expanding product scope.

This is not a full visual redesign sprint and not a scoring/matching implementation sprint.

---

## Starting Baseline

Start after Public Beta Readiness Audit v1 PR is reviewed/merged or explicitly accepted as the audit baseline.

Current audit result:

```text
CONDITIONAL GO — usable for a tiny, manually guided closed beta only.
Not ready for open public traffic.
```

Known current merged sequence on main:

- PR #20 — post-onboarding cockpit / non-locking start / honest pilot path
- PR #21 — landing ↔ app visual continuity working layer
- PR #22 — Contextual Fit Signals / Score Doctrine
- PR #23 — Scouting / Opportunity Language Cleanup v1
- PR #24 — Public Beta Readiness Audit v1, if merged before this sprint

PR #18 remains open/draft and must stay untouched.

---

## Required Pre-Flight

Before any implementation:

1. Checkout `main`.
2. Fetch origin.
3. Pull latest `origin/main`.
4. Confirm local `main == origin/main`.
5. Confirm PR #18 remains open/draft and untouched.
6. Confirm working tree is clean.
7. Read:
   - `docs/audits/PUBLIC-BETA-READINESS-AUDIT-V1.md`
   - `docs/PRODUCT_CONSTITUTION.md`
   - `docs/CONTEXTUAL_FIT_SIGNALS.md`
   - `docs/DEMO_TO_REAL_DATA_POLICY.md`

---

## Absolute Non-Negotiables

Do not touch:

- PR #18
- Supabase migrations
- RLS/RPC
- production DB schema
- billing
- payments
- deploy
- DNS
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
- fake scores
- fake jobs
- fake candidates
- fake companies
- fake real metrics

Env verification may be documented and safely checked, but do not modify production environment variables unless the owner explicitly does it outside this task.

---

## P0 Objectives

### P0.1 — Verify pilot / lead capture path

The audit says the beta is not safe until the real lead capture path is verified.

Goal:

Confirm that the dashboard pilot request path can persist a real lead or, if this cannot be verified safely, produce an explicit owner action checklist.

Check:

- `/api/leads` route behavior.
- Whether it depends on `SUPABASE_SERVICE_ROLE_KEY`.
- Whether missing env fails loudly or silently.
- Whether UI gives the user honest feedback.
- Whether a real end-to-end test can be safely performed without touching production data incorrectly.

Allowed outcomes:

1. Verified safe end-to-end using an owner-approved test account / test submission.
2. Not verifiable in this environment → create explicit owner checklist and mark as P0 still blocked.
3. If UI currently says success when persistence may fail, fix only the safe UI/API behavior so it does not silently lose leads.

Do not change DB schema.

### P0.2 — Tame hero preview counters

Audit flags large hero counters such as `318K` as implying real platform scale.

Goal:

Keep WOW concept visuals, but make them clearly product-vision / pre-alpha preview rather than real achieved metrics.

Do not delete the visual energy.

Allowed fixes:

- Change labels to `Preview`, `Concept signal`, `Product vision`, `Pre-alpha view`.
- Replace scale-like real-user numbers with non-deceptive preview language.
- Add small contextual chip near counters.
- Move exact large values out if they strongly imply real active usage.

Do not make landing empty.

---

## P1 Objectives

### P1.1 — Reword 8 non-primary locale deep pages

The audit says EN/LT are reframed, but 8 non-primary locales still contain risk terms such as OVR/ranked/matching in deep `/for-*` pages.

Goal:

Bring the remaining locales into the same safe framing.

Languages:

- `lv`
- `et`
- `pl`
- `de`
- `nl`
- `sv`
- `no`
- `da`

Keep translations simple if necessary, but avoid raw dangerous terms that imply universal people-ranking.

### P1.2 — Resolve empty dashboard nav tabs

Audit flags `Discover` and `Search` dashboard nav tabs as empty or weak.

Goal:

Avoid dead-end navigation before beta.

Allowed fixes:

1. Hide these nav items until useful.
2. Replace with honest “coming soon / pilot path” content.
3. Redirect to a meaningful existing opportunity/pilot surface.
4. Keep only if they have a clear honest next step.

Do not implement a fake search or fake discovery system.

---

## P2 Optional If Small

Only if safe and quick:

- relabel numeric concept gauges `92/87/79` as per-context fit / readiness preview signals;
- reduce one obvious landing-length pain point;
- fix harmless `href="#"` anchors if present;
- add tiny PRE-ALPHA/preview labels where concept visuals are still too claim-like.

---

## Required Review Artifact

Create or update local gitignored review artifact:

```text
runtime/review/public-beta-hardening-v1/
```

It should include:

1. P0/P1 checklist.
2. Lead capture verification status.
3. Before/after for hero counters.
4. List of locale risk terms cleaned.
5. Dashboard nav strategy.
6. Screenshots or route evidence if available.
7. Remaining beta blockers.

Artifact must be owner-readable, not a giant internal dump.

---

## Acceptance Criteria

The sprint is acceptable if:

1. Lead capture is verified OR explicit owner action remains as a clear P0 blocker.
2. Hero counters no longer imply real platform scale.
3. Dangerous non-primary-locale scoring/matching/ranking wording is reduced.
4. Empty Discover/Search dead ends are resolved or honestly gated.
5. No fake matching/search/score/verification is added.
6. No unsafe DB/migration/billing/deploy/env work is done.
7. Validation is real.
8. Final recommendation says whether closed beta is:
   - GO
   - CONDITIONAL GO
   - NO-GO

---

## Validation

Run available checks:

- typecheck
- lint
- build
- placeholders/check or no-fake guard if present
- route/smoke checks if available
- all locale JSON parse
- forbidden path check
- git diff scope verification

If checks cannot be run, state why. Do not fake validation.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Exact files changed.
5. P0.1 lead capture result.
6. P0.2 hero counter changes.
7. P1.1 locale cleanup summary.
8. P1.2 dashboard nav strategy.
9. Review artifact path.
10. Validation results.
11. Updated beta go/no-go recommendation.
12. Remaining P0/P1/P2 items.
13. Confirmation that PR #18, migrations, RLS/RPC, DB schema, billing, payments, deploy, DNS, env, fake AI, fake matching, fake verification, fake scores, fake jobs, fake candidates, and fake companies were not touched or added.

---

## Recommended Branch Name

```text
fix/cc/public-beta-hardening-v1
```
