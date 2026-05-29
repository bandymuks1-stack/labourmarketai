# Labourmarket.ai — 12-Step Super Long Autonomous Cycle

## Owner paste command

After downloading this MD file, paste this to the agent:

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

GOAL: Execute the downloaded MD plan file exactly.

The owner downloaded this file locally:
labourmarketai-12-step-super-cycle.md

First locate the file on disk.

Likely paths:
- C:\Users\Mano\Downloads\labourmarketai-12-step-super-cycle.md
- C:\Users\Mano\Documents\labourmarketai-12-step-super-cycle.md
- C:\Users\Mano\Desktop\labourmarketai-12-step-super-cycle.md

Required first steps:
1. Find the MD file.
2. Copy it into the repo:
   C:\Users\Mano\Documents\labourmarketai\docs\goals\labourmarketai-12-step-super-cycle.md
3. Read the copied file fully.
4. Treat it as the source of truth.
5. Work through the 12 steps in order.
6. Do not ask the owner questions unless a real blocker appears.
7. Open PRs when useful.
8. Merge only when current autonomy policy allows it and all required checks are green.
9. Keep final reports short.
10. At the end, produce one concise end-of-cycle report.

Do not invent a different project. Do not touch LABMA, Agentai, Vismantas, or other repos.
```

---

# Main goal

Run one long, useful labourmarket.ai product-building cycle while the owner is away.

The last confirmed state:

- main HEAD after Employment ↔ Work Journal Operations Bridge v1: `46e97b2`
- PR #120 created additive migration `0030_company_agency_worker_ops_bridge.sql`
- migration 0030 is committed but NOT applied to production DB
- app has 42703 graceful fallback, so live app is safe before migration apply
- `employment-journal-context` helper exists
- company/agency worker rows show operations role/title and review status
- foreman/brigadier and project manager/site manager remain `not_enabled`
- work journal review visibility is partial
- no fake roles, fake approvals, fake matching, fake AI

This 12-step cycle must improve the product without applying production DB migration unless a separate explicit owner confirmation exists.

---

# Core rule

Do not fake progress.

If a feature requires migration 0030 to be applied, show an honest `not available until migration is applied` state or improve code/tests/docs around it. Do not pretend live DB fields exist.

---

# Hard boundaries

Do not touch:

- LABMA repo
- Agentai repo
- Vismantas / wavi repo
- production secrets
- payment / checkout
- marketplace activation
- external email/WhatsApp/Telegram sending
- public file URLs
- destructive DB changes
- production DB apply of migration 0030 unless separately and explicitly confirmed by owner
- fake users, companies, workers, projects, requests, work entries
- AI/OCR/PDF provider integrations
- paid API integration

Do not implement:

- payroll
- automatic matching
- automatic candidate offers
- automatic work confirmation
- fake verification/reputation
- fake GPS/time tracking
- fake productivity scoring

Forbidden claims:

- fully verified
- automatically approved
- AI matched
- guaranteed best worker
- patvirtinta
- automatiškai patvirtinta
- AI suprato
- verified
- best match
- guaranteed candidate

---

# 12-step execution plan

## Step 1 — Repo state and safety checkpoint

Goal: know exact current state before changing anything.

Tasks:
1. Pull/fetch latest `origin/main`.
2. Confirm main is `46e97b2` or newer.
3. Confirm working tree clean.
4. Confirm migration 0030 exists but is not applied by any local command in this cycle.
5. Read:
   - `docs/audits/company-worker-foreman-operations-truth-v1.md`
   - `docs/contracts/employment-journal-bridge-contract-v1.md`
   - `apps/web/lib/operations/employment-journal-context.ts`
   - `apps/web/lib/operations/role-capabilities.ts`
   - relevant company/agency/work-journal dashboard files.

Output:
- short internal notes only.
- Do not open a PR for Step 1 alone unless it finds a critical issue.

---

## Step 2 — Product truth map refresh

Goal: create or update a concise product truth map after the latest bridge cycle.

Preferred PR:
`docs/product-truth/company-worker-journal-current-state-v1.md`

Include:
- what is real
- what is partial
- what is blocked by migration 0030
- what is not enabled
- what should be built next

Classification table:
- buyer request workflow
- worker profile
- company workers
- agency workers
- work journal create/persist
- employment ↔ journal bridge
- foreman/brigadier
- project manager/site manager
- manual review
- operations role/title

Acceptance:
- honest, concrete, evidence-based
- no fake claims
- short enough to be useful

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
```

---

## Step 3 — Migration 0030 readiness guide

Goal: prepare owner for safe migration apply without applying it.

Preferred PR:
`docs/runbooks/apply-migration-0030-ops-bridge.md`

Include:
- what migration 0030 does
- why it is additive
- what it does NOT do
- pre-apply checklist
- apply options
- post-apply verification queries
- rollback/non-destructive recovery notes
- expected app behavior before apply
- expected app behavior after apply
- owner warning: do not run if unsure

Do not run production DB commands.

Acceptance:
- owner can understand what will happen
- no secrets
- no DB apply

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
```

---

## Step 4 — Pre-migration UI hardening

Goal: make pre-migration state clearer to users/admins.

Preferred PR:
`fix/ops-bridge-pre-migration-clarity-v1`

Improve company/agency panels so when migration columns are unavailable or null:
- show clear fallback
- avoid raw technical terms
- explain role/title/review is not assigned yet
- do not scare normal users with DB language
- admin-facing copy can mention setup not complete

LT example:
`Operacinės rolės dar nepriskirtos. Darbo žurnalo peržiūros ryšys bus įjungiamas tik po saugaus nustatymo.`

EN example:
`Operational roles are not assigned yet. Work journal review will be enabled only after safe setup.`

Acceptance:
- clearer UI before migration is applied
- no fake active status
- no DB command

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

---

## Step 5 — Operations role assignment plan, no write UI yet

Goal: define how roles will be assigned safely later.

Preferred PR:
`docs/contracts/operations-role-assignment-v1.md`

Define:
- allowed operations roles
- who may assign them later
- what needs to be true before enabling UI
- audit/log requirement
- why foreman/PM review cannot come from text label alone
- what data needs to exist before `journal_review_enabled=true`
- future minimal UI shape

Do not implement write UI yet unless a real safe server action already exists and permissions are clear.

Acceptance:
- clear path to future role assignment
- no fake assignment button

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
```

---

## Step 6 — Work journal review visibility audit

Goal: inspect and document exactly what review chain exists today.

Preferred PR:
`docs/audits/work-journal-review-chain-current-state-v1.md`

Answer:
- where entries are created
- where entries persist
- where reviewer sees entries, if anywhere
- what review statuses exist
- what server actions/API exist
- what permissions exist
- how this relates to employment bridge
- what is missing before foreman/PM can review

Acceptance:
- no implementation unless small guard needed
- concrete file/route references
- clear next PR suggestions

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
```

---

## Step 7 — Work journal review helper hardening

Goal: if helpers exist, strengthen pure helper/test logic around manual review readiness.

Preferred PR:
`test/work-journal-review-readiness-v1` or `feat/work-journal-review-readiness-helper-v1`

Only do this if supported by existing code.

Helper should be conservative:
- if no employment context → not enabled
- if journal_review_enabled false → not enabled
- if role/title only says foreman/PM but no permission/context → not enabled
- if true connection exists → can_view or can_review depending on real data

Acceptance:
- pure helper
- truth table tests
- no fake approval state
- no DB change

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm vitest run
```

---

## Step 8 — Company/agency dashboard next-action improvement

Goal: make company/agency dashboards more operational without fake coordination.

Preferred PR:
`feat/company-agency-ops-next-actions-v1`

Show one next action per worker relationship:
- assign role later / setup required
- enable review later / setup required
- review not enabled
- worker connected
- invitation pending, if real

Do not add buttons unless existing safe action exists.

Acceptance:
- one clear next action
- no fake controls
- LT/EN copy
- tests/guards if visible copy is important

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

---

## Step 9 — Minimal visual polish for operations rows

Goal: make company/agency worker rows easier to understand.

Preferred PR:
`style/company-agency-worker-ops-visual-v1`

Allowed:
- clearer chips
- grouping person/role/review/next action
- mobile spacing
- status rail or small visual hierarchy
- no new heavy dependency
- no fake metrics

Acceptance:
- better readability
- not a heavy redesign
- no fake functionality

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
```

---

## Step 10 — Ops truth guards

Goal: prevent future drift.

Preferred PR:
`test/ops-bridge-truth-guards-v2`

Guard against:
- fake foreman/PM active copy
- approve/reject UI without real action
- automatic verification claims
- GPS/time tracking claims
- importing AI/payment/external packages into ops helpers
- setting review enabled from label alone
- exposing public file URLs in unrelated request areas if touched

Acceptance:
- useful stable guards
- not brittle
- tests green

Validation:
```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm vitest run
```

---

## Step 11 — Decide if a safe small implementation PR is possible

Goal: use all previous findings to decide if one more code PR can be done safely.

Possible safe PRs:
- better admin/company read-only queue
- better ops setup checklist
- clearer not-enabled role cards
- role assignment UI skeleton clearly disabled/not enabled
- no DB write

Do not implement:
- role assignment write
- review enable write
- approve/reject actions
- foreman dashboard with fake data
- project/team model if absent

If no safe PR exists, write a short decision note instead:
`docs/decisions/next-ops-implementation-after-migration-0030.md`

Acceptance:
- no half-built feature
- no fake controls
- clear next recommended action after migration apply

---

## Step 12 — End-of-cycle consolidation

Goal: leave the repo in a clean, understandable state.

Tasks:
1. Ensure all PRs are either merged or clearly open with reason.
2. Delete merged remote branches.
3. Run final smoke on main if merges occurred:
```bash
pnpm -F web typecheck
pnpm -F web build
pnpm vitest run apps/web/lib/operations apps/web/lib/guards
```
4. Produce short final report:
   - PRs opened
   - PRs merged
   - main HEAD
   - branches deleted/not deleted
   - tests run
   - docs/routes to check
   - what improved
   - what is still blocked by migration 0030
   - what should be done immediately after owner applies migration
   - safety confirmation

---

# Autonomy rules

Proceed autonomously when:
- changes are docs/code/UI/test only
- no production DB apply
- no secrets
- no payment
- no outbound communication
- no destructive DB change
- no other repo touched
- tests are green
- PR scope remains small and clear

Stop and ask owner only if:
- production migration apply is required
- destructive DB migration would be needed
- broad RLS redesign is needed
- paid provider/API is needed
- external outreach/send is requested
- implementation would require fake data or fake claims
- permission model could expose private data

---

# Branch naming

Use one branch per PR:

- `docs/product-truth-after-ops-bridge-v1`
- `docs/migration-0030-runbook-v1`
- `fix/ops-bridge-pre-migration-clarity-v1`
- `docs/operations-role-assignment-v1`
- `docs/work-journal-review-chain-audit-v1`
- `feat/work-journal-review-readiness-helper-v1`
- `feat/company-agency-ops-next-actions-v1`
- `style/company-agency-worker-ops-visual-v1`
- `test/ops-bridge-truth-guards-v2`
- `docs/next-ops-implementation-after-0030-v1`

---

# Final report format per PR

Keep each report short:

```text
Final report

1. PR URL:
2. Branch:
3. Commit SHA:
4. Files changed:
5. What changed:
6. What works now:
7. What is still not implemented:
8. Migration status:
9. Validation:
10. Safety:
11. Test URLs or docs path:
```

No huge evidence packs.

---

# End-of-cycle verdict requirements

At the end say clearly:

- Is migration 0030 still unapplied?
- Is the live app safe before migration apply?
- What becomes possible after migration apply?
- What is still impossible without new role assignment/write UI?
- Is foreman/PM real, partial, or still not enabled?
- Is work journal review connected to employment relationships yet, or only bridge-ready?
