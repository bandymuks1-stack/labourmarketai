# TASK — Public Beta Readiness Audit v1

## Goal

After the WOW foundation sequence has been merged, perform a real Public Beta Readiness Audit for Labourmarket.ai.

This is not a new feature sprint. It is a readiness, risk, and go/no-go audit to determine what still blocks a limited public beta with real people and companies.

Merged foundation sequence now on `main`:

- PR #20 — post-onboarding cockpit / non-locking start / honest pilot path
- PR #21 — landing ↔ app visual continuity working layer
- PR #22 — Contextual Fit Signals / Score Doctrine
- PR #23 — Scouting / Opportunity Language Cleanup v1

PR #21 is accepted only as a working visual-continuity layer, not the final WOW visual standard.

---

## Required Starting State

Before work:

1. Checkout `main`.
2. Fetch origin.
3. Pull latest `origin/main`.
4. Confirm local `main == origin/main`.
5. Confirm PR #23 merge commit is present.
6. Confirm PR #18 remains open/draft and untouched.
7. Confirm working tree is clean.

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

- new app features
- DB fields
- schema changes
- scoring engine
- matching engine
- verification engine
- fake AI
- fake matching
- fake verified skills
- fake jobs
- fake candidates
- fake companies
- fake real metrics

This audit may create docs and gitignored review artifacts only.

---

## Read First

Read:

1. `docs/PRODUCT_CONSTITUTION.md`
2. `docs/CONTEXTUAL_FIT_SIGNALS.md`
3. `docs/DEMO_TO_REAL_DATA_POLICY.md`
4. `docs/handoffs/WOW-BETA-V1-ARCHITECTURE-AUDIT.md`
5. Recent merged changes from PR #20, #21, #22, #23.
6. Current landing, signup, login, dashboard, profile, roles, company/agency, pilot request, and lead capture code.

---

## Audit Questions

Answer clearly.

### 1. Can a new person start?

Check whether a new individual can:

- understand the product within 30 seconds;
- register / login;
- choose a starting direction without being locked;
- understand they can add more roles/activities later;
- reach a useful first dashboard;
- see a clear next move;
- begin building a work identity.

### 2. Can a company / agency start?

Check whether a company, agency, or activity owner can:

- understand the product within 30 seconds;
- register / login;
- choose an activity direction without being locked;
- understand they can add worker/company/team/agency/project paths later;
- reach a useful first dashboard;
- submit or request pilot review;
- understand what happens after the request.

### 3. Is there a real beta value path?

Check whether the product already gives real limited beta value:

- worker work identity start;
- profile/CV direction;
- skills / proof / journal direction;
- company/agency pilot request;
- lead capture path;
- honest manual review path;
- no fake matching/scoring/verification.

### 4. Are there dead ends?

Find:

- buttons that go nowhere;
- CTAs that lead to empty pages;
- routes that feel broken;
- dashboards with weak or unfinished first impression;
- role paths with no meaningful next step;
- mobile overflow;
- copy that promises more than the system does.

### 5. Is the first impression acceptable?

Assess:

- landing first impression;
- signup/login;
- onboarding role/start direction;
- first dashboard;
- worker cockpit;
- company/agency cockpit;
- mobile at 390px;
- whether it feels coherent enough for a limited public beta.

Be honest: PR #21 is not the final WOW visual standard. Do not pretend the product is fully premium if it is only working-level.

### 6. Are concept/demo visuals governed?

Check whether concept visuals:

- are not presented as real production achievements;
- follow the Demo-to-Real policy;
- avoid fake active-user/matching/score/verified claims;
- have clear enough PRE-ALPHA / concept / preview framing where needed.

### 7. Is contextual scoring doctrine respected?

Check whether visible wording still suggests:

- one universal human value score;
- global rank of people;
- real matching before it exists;
- real verification before it exists;
- fake OVR/profile strength/ranking claims.

Classify remaining issues as:

- blocker before public beta;
- safe as governed concept;
- future polish.

### 8. What blocks limited public beta?

Create a short P0/P1/P2 list.

P0 = must fix before inviting any external users.
P1 = should fix before broader beta.
P2 = can improve after early beta.

---

## Required Live / Local Review

Try to review:

1. Landing desktop and mobile.
2. Signup desktop and mobile.
3. Login desktop and mobile.
4. Dashboard unauthenticated redirect/auth wall.
5. Worker dashboard if safe test session exists.
6. Company/agency dashboard if safe test session exists.
7. Public company / opportunity / design pages if relevant.

If authenticated dashboards cannot be safely captured:

- do not use production credentials;
- do not touch production DB;
- do not fabricate live test results;
- use code review plus local/static/gitignored artifact;
- clearly mark authenticated visual review as not live.

---

## Output Documents

Create:

```text
docs/audits/PUBLIC-BETA-READINESS-AUDIT-V1.md
```

Optional if useful:

```text
runtime/review/public-beta-readiness-v1/
```

The runtime review artifact must be gitignored and local-only.

---

## Audit Format

The audit must include:

1. Executive summary.
2. Current merged baseline.
3. What is already beta-ready.
4. What is not beta-ready.
5. Person/worker path assessment.
6. Company/agency path assessment.
7. Pilot request / lead capture assessment.
8. Mobile assessment.
9. Fake-claim / demo-to-real / contextual scoring assessment.
10. Dead-end CTA and empty-surface list.
11. P0/P1/P2 readiness blockers.
12. Recommended next sprint.
13. Clear go/no-go recommendation for limited public beta.

---

## Go / No-Go Definitions

### GO for limited closed beta

Allowed only if:

- no fake claims;
- no serious mobile break;
- new user can understand first step;
- pilot request works or has an honest manual path;
- dashboards do not feel broken;
- dangerous scoring/matching/verification claims are absent or governed;
- no security/DB/payment/deploy risks were introduced.

### NO-GO

If any of these are true:

- users are locked into one role;
- fake AI/matching/scoring/verification is presented as real;
- pilot request path does not work;
- mobile first impression is broken;
- dashboard is mostly empty or confusing;
- product claims cannot be defended honestly.

### CONDITIONAL GO

If the product is usable for a tiny manually guided beta, but not for open public traffic, say so clearly.

---

## Validation

Run only safe checks:

- typecheck if no app code changed, optional but useful;
- lint if no app code changed, optional;
- build if no app code changed, optional;
- route/smoke checks if already available;
- locale JSON parse if copy inspected;
- no forbidden paths changed;
- git diff scope verification.

If checks cannot be run, say why. Do not fake validation.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Exact files changed.
5. Confirmation PR #23 was merged and used as base.
6. Confirmation PR #18 remained untouched.
7. Public beta go/no-go recommendation.
8. P0/P1/P2 blocker summary.
9. What can be shown to users now.
10. What must be fixed before showing to users.
11. Screenshot/review artifact path if generated.
12. Validation results.
13. Confirmation no DB/migrations/RLS/RPC/billing/payments/deploy/DNS/env/fake AI/fake matching/fake verification/fake scoring engine were touched or added.

---

## Recommended Branch Name

```text
docs/cc/public-beta-readiness-audit-v1
```
