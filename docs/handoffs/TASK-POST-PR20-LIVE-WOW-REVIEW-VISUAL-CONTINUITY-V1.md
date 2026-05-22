# TASK — Post-PR20 Live WOW Review + Visual Continuity Sprint v1

## Goal

After PR #20 is merged, inspect the real app experience and start the next big step: make the landing and app interior feel like one coherent, cinematic, action-oriented Labourmarket.ai product.

This sprint is not about adding more product scope. It is about turning the current “somewhat improved but still static” experience into a stronger WOW first impression.

---

## Required Starting State

Start only after PR #20 is merged.

Before work:

1. Checkout `main`.
2. Fetch and pull latest `origin/main`.
3. Confirm local `main == origin/main`.
4. Confirm PR #20 merge commit is present.
5. Confirm PR #18 remains open/draft and untouched.
6. Confirm working tree is clean.

---

## Owner Feedback Driving This Sprint

The current artifacts/screens still feel too static and list-heavy.

Owner concerns:

- Too many long lists.
- Review artifact feels like an inventory page, not a product experience.
- The product still does not create enough WOW.
- WOW should feel like action, movement, cinematic flow, guided operations, and a living system.
- People must not be framed like commodities.
- Landing may use concept visuals while real data is missing, but there must be a clear demo-to-real foundation.
- The product should impress from first touch and make users feel they are entering a serious labour-market opportunity OS.

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

- fake AI
- fake matching
- fake verified skills
- fake ratings
- fake jobs
- fake candidates
- fake companies
- fake real metrics
- new DB/schema changes

Keep all demo/concept visuals governed by `docs/DEMO_TO_REAL_DATA_POLICY.md`.

---

## Big-Step Mission

Create a real visual continuity and action-system pass across:

1. Landing first impression.
2. Signup / role-start entry.
3. Dashboard post-onboarding hub.
4. Worker work-identity cockpit.
5. Company / agency activity cockpit.
6. Pilot request / opportunity direction.
7. Review artifacts that show actual user-facing screens, not long internal inventories.

The system should feel like:

- action;
- motion;
- cinematic operating cockpit;
- guided next move;
- scouting / draft / opportunity system;
- premium, not generic admin;
- human-first, not commodity-market.

---

## Required Live Review First

Before changing code, capture a live review from merged main.

Capture or document:

1. Landing desktop and mobile.
2. Signup/start-direction desktop and mobile.
3. Login desktop and mobile.
4. Dashboard redirect/auth wall if unauthenticated.
5. Worker dashboard if a safe test session exists.
6. Company/agency dashboard if a safe test session exists.

If authenticated dashboards cannot be captured safely:

- do not use production credentials;
- do not touch production DB;
- use a local/static review route or gitignored artifact;
- make sure the artifact looks like product review, not an internal inventory list.

---

## Design Direction

### 1. Reduce lists

Avoid long card walls and huge vertical inventories.

Use:

- hero cockpit;
- 3-4 action stages;
- progress rail;
- next-action panel;
- animated signal path;
- compact proof/status widgets;
- clear primary CTA;
- secondary actions grouped below.

### 2. Create movement

Use safe UI motion:

- soft pulsing nodes;
- animated gradient rails;
- moving signal line;
- reveal transitions;
- hover/tap states;
- directional arrows;
- cinematic panel layering.

Respect `prefers-reduced-motion`.

Motion must be decorative and must not imply real live matching or real verified activity unless backed by data.

### 3. Human-first language

Avoid commodity-style language around people.

Avoid or carefully reframe:

- `paklausa` when it sounds like people are commodities;
- `live demand` if it suggests people are market units;
- `score` if it suggests fake ranking;
- `matching` if real matching does not exist;
- `verified` if verification is not actually backed by data.

Preferred framing:

- opportunities;
- direction;
- fit signals;
- work identity;
- proof;
- readiness;
- activity space;
- teams;
- abilities;
- needs;
- pilot review;
- human-reviewed request.

### 4. Keep concept visuals, but make them governed

Concept visuals can remain if they create WOW.

But they must be framed as:

- product vision;
- preview;
- concept interface;
- sample signal;
- pre-alpha preview.

Never frame concept visuals as real production achievements.

---

## Implementation Priorities

### Priority A — Landing ↔ App Visual Continuity

The landing and app interior must feel like the same product.

Align:

- dark premium visual language;
- gradients;
- typography rhythm;
- card treatment;
- cockpit/panel style;
- motion language;
- status chips;
- CTA style.

Do not rebuild the whole site unless necessary. Improve the key surfaces that create first impression.

### Priority B — Dashboard as Action Cockpit

The dashboard should not be a static list.

It should answer:

1. Where am I now?
2. What did I start with?
3. What is my next move?
4. How do I add another activity later?
5. What opportunity path opens next?

### Priority C — Worker Journey

Worker first surface should feel like:

```text
Work identity is coming online → Add proof → Open opportunities
```

Use:

- next move;
- proof signal;
- readiness path;
- opportunity direction;
- profile/journal entry points.

### Priority D — Company / Agency Journey

Company/agency first surface should feel like:

```text
Define need → Prepare criteria → Review fit → Request pilot
```

Use:

- need definition;
- criteria setup;
- human review;
- honest pilot request;
- no fake matching.

### Priority E — Review Artifact Quality

The review artifact must not look like a giant internal list.

It should be an owner-review presentation:

- short intro;
- desktop/mobile frames;
- side-by-side before/after if useful;
- clear “what changed” summary;
- no huge policy inventory as the main visual;
- link or appendix for detailed policy tables.

---

## Do Not Do

Do not:

- implement real matching;
- implement scoring;
- implement verification;
- add DB fields;
- add migrations;
- use production credentials;
- touch PR #18;
- add payment/pricing;
- add external data fetching;
- create fake jobs/candidates/companies;
- hide demo status by pretending it is real.

---

## Acceptance Criteria

The sprint is acceptable only if:

1. Landing and app interior feel more visually connected.
2. Main dashboard feels like an action cockpit, not a static card list.
3. Worker path has a clear next move in under 30 seconds.
4. Company/agency path has a clear pilot/action path.
5. Long internal inventory lists are removed from the primary review experience.
6. Human-first language is used.
7. Demo/concept visuals remain governed by the Demo-to-Real policy.
8. Mobile at 390px is clean.
9. No unsafe files/systems are touched.
10. Validation is real.

---

## Validation

Run available checks:

- typecheck
- lint
- build
- placeholders/check or no-fake guard if present
- route/smoke checks if available
- local screenshot/review artifact generation if possible

If a check cannot be run, state why. Do not fake validation.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Exact files changed.
5. Whether PR #20 was merged and used as base.
6. Whether PR #18 remained untouched.
7. What visual continuity improvements were made.
8. What list-heavy sections were removed/reworked.
9. What action/motion/cockpit elements were added.
10. What language was reframed to respect people.
11. Screenshot/review artifact path.
12. Mobile status.
13. Validation results.
14. Remaining first-impression risks.
15. Confirmation that no DB/migrations/RLS/RPC/billing/payments/deploy/DNS/env/fake AI/fake matching/fake verification/fake jobs/fake candidates/fake companies were touched or added.

---

## Recommended Branch Name

```text
feat/cc/post-pr20-visual-continuity-action-v1
```
