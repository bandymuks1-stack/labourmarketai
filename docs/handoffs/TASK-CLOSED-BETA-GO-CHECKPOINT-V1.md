# TASK — Closed Beta GO Checkpoint v1

## Goal

Create a docs-only checkpoint after production smoke and pilot lead-capture testing.

This checkpoint records whether Labourmarket.ai is ready for a limited, manually guided closed beta.

This is not a feature sprint.

---

## Required Starting State

Start after PR #25, PR #26, and PR #28 are merged and deployed or confirmed on main.

Before creating the checkpoint:

1. Confirm current main SHA.
2. Confirm production deployment SHA if available.
3. Confirm PR #18 remains open/draft and untouched.
4. Confirm working tree is clean.

---

## Owner-Side Checks To Record

Record the actual result of:

### 1. Production deployment

- Current production commit SHA.
- Whether latest deployment is Ready.
- Whether it includes PR #26 and PR #28.

### 2. Dashboard smoke

Check production routes:

- `/lt/dashboard`
- `/lt/dashboard/profile`
- `/lt/dashboard/journal`

Record:

- dashboard duplicate profile/skills/journal CTAs are consolidated;
- profile supports additional work directions;
- additional directions are editable/removable;
- skills from multiple directions persist after reload;
- journal is free-text first;
- journal can save without work direction;
- optional work direction still works;
- language selector is not the old long code row.

### 3. Pilot lead-capture test

Record:

- `SUPABASE_SERVICE_ROLE_KEY` exists in Vercel Production env;
- a real pilot request was submitted;
- the UI showed success or error;
- Supabase `leads` table contains the new row;
- source/intention/email if visible and safe to record without exposing secrets.

Never record secrets.

---

## Go / No-Go Decision

Use one of:

```text
GO — limited manually guided closed beta
CONDITIONAL GO — only after listed owner action
NO-GO — blocker remains
```

### GO allowed only if:

- production deployment is current;
- pilot request creates a real lead row;
- dashboard/profile/journal smoke passes;
- no fake AI/matching/scoring/verification claims are presented as real;
- PR #18 remains untouched;
- no DB/migration/billing/deploy risk was introduced.

---

## Required Output File

Create:

```text
docs/audits/CLOSED-BETA-GO-CHECKPOINT-V1.md
```

---

## Suggested Document Structure

The document must include:

1. Executive summary.
2. Production baseline:
   - main SHA;
   - production SHA;
   - deployment status.
3. PR sequence included:
   - PR #20;
   - PR #21;
   - PR #22;
   - PR #23;
   - PR #25;
   - PR #26;
   - PR #28.
4. PR #18 status.
5. Production smoke results:
   - dashboard;
   - profile;
   - journal;
   - language selector.
6. Lead capture result.
7. Go/no-go decision.
8. Remaining limitations:
   - not open public launch;
   - WOW visual standard still not final;
   - full locale polish remains;
   - PR #18 DB hardening remains separate;
   - future journal extraction remains not implemented;
   - scoring/matching remains doctrine-only, not engine.
9. Next recommended sprint.

---

## Non-Negotiables

Do not touch:

- PR #18
- Supabase migrations
- RLS/RPC
- DB schema
- billing
- payments
- deploy
- DNS
- env
- migration files
- app code

Do not add:

- fake AI
- fake automatic parsing
- fake matching
- fake verification
- fake scores
- fake jobs
- fake candidates
- fake companies
- scoring engine
- matching engine
- verification engine

Do not print or store secrets.

---

## Validation

Because this is docs-only:

- verify git diff contains only docs/audits checkpoint file;
- optionally run markdown/doc checks if available;
- do not run unnecessary app builds unless repo policy requires.

---

## Final Report Must Include

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Exact files changed.
5. Production SHA recorded.
6. Lead-capture result.
7. Closed beta decision.
8. Remaining blockers/risks.
9. Confirmation no app code, DB, migrations, RLS/RPC, billing, deploy, DNS, env, PR #18, fake AI/matching/verification/scoring were touched or added.

---

## Recommended Branch Name

```text
docs/cc/closed-beta-go-checkpoint-v1
```
