# Labourmarket.ai — Company Employment ↔ Work Journal Operations Bridge v1

## Owner paste command

After downloading this MD file, paste this to the agent:

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

GOAL: Execute the downloaded MD plan file exactly.

The owner downloaded this file locally:
labourmarketai-employment-journal-ops-bridge-v1.md

First locate the file on disk.

Likely paths:
- C:\Users\Mano\Downloads\labourmarketai-employment-journal-ops-bridge-v1.md
- C:\Users\Mano\Documents\labourmarketai-employment-journal-ops-bridge-v1.md
- C:\Users\Mano\Desktop\labourmarketai-employment-journal-ops-bridge-v1.md

Required first steps:
1. Find the MD file.
2. Copy it into the repo:
   C:\Users\Mano\Documents\labourmarketai\docs\goals\labourmarketai-employment-journal-ops-bridge-v1.md
3. Read the copied file fully.
4. Treat it as the source of truth.
5. Work for one long autonomous cycle.
6. Do not ask the owner questions unless a real blocker appears.
7. The owner explicitly allows a small additive DB migration if the audit proves it is necessary for the employment ↔ work-journal bridge.
8. Open PRs when useful.
9. Merge only when current autonomy policy allows it, migrations are safe/additive, and all required checks are green.
10. Keep final reports short.

Do not invent a different project. Do not touch LABMA, Agentai, Vismantas, or other repos.
```

---

# Main goal

Build the first real operational bridge between:

```text
company/agency employment relationships
→ worker role/title
→ work journal context
→ manual review responsibility
→ company/admin operational visibility
```

The previous audit concluded:

- worker: `real_working`
- company worker management: `partial_working`
- foreman/brigadier: `missing / ui_only`
- project manager/site manager: `missing / ui_only`
- work journal: `real_working` for create/persist
- review/approval chain: real in journal org model, but disconnected from company/agency employment links

This cycle must start closing that gap honestly.

---

# Desired result

After this cycle, labourmarket.ai should have a safer foundation for company/worker/work-journal operations:

1. A small additive schema bridge if needed.
2. A canonical helper that maps company/agency employment to journal/review context.
3. Clear worker role/title/status display in company/agency/admin surfaces.
4. A manual review queue or review readiness state based on real relationships only.
5. Honest foreman/project-manager status: not enabled until real fields and permissions exist.
6. Guards preventing fake role coordination or fake approvals.

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

Do not claim:
- foreman fully works unless actual data/permissions/UI prove it
- project manager fully works unless actual data/permissions/UI prove it
- work entries are approved unless a real review/approval model supports it
- skills are verified unless actual confirmation logic supports it

Forbidden copy/claims:
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

# Important owner decision

Owner authorizes **one small additive DB migration only if necessary** for this bridge.

Allowed migration types:
- add nullable columns to existing employment/worker relation table
- add safe enum/check-like text status if repo style supports it
- add indexes for lookup if needed
- add RLS only if required and safe
- create a small bridge table only if adding columns is clearly worse

Disallowed migration types:
- destructive changes
- dropping/renaming columns
- backfilling fake data
- breaking existing RLS
- changing auth model broadly
- changing payment/marketplace models

If migration is needed, agent must:
1. explain why existing schema cannot support the bridge;
2. keep it additive;
3. add tests/guards where possible;
4. run migration validation commands used by this repo;
5. report exact file and purpose.

---

# Work strategy

Use small PRs. Prefer this sequence:

1. PR A — Schema/contract decision and additive bridge migration if needed
2. PR B — Employment ↔ journal context helper
3. PR C — Company/agency worker role/title clarity
4. PR D — Manual journal review visibility from real employment context
5. PR E — Foreman/PM not-enabled foundation or minimal role-ready UI
6. PR F — Guard/test hardening

If PR A finds no migration is needed, make PR A docs/contract + helper-only and continue.

---

# PR A — Schema/contract decision + additive bridge

## Goal

Decide and implement the smallest safe data contract needed to connect company/agency employment with work journal review context.

## Tasks

1. Pull latest `origin/main`.
2. Confirm main is at `ebfb34e` or newer.
3. Read:
   - `docs/audits/company-worker-foreman-operations-truth-v1.md`
   - `apps/web/lib/operations/role-capabilities.ts`
   - existing company/agency worker helpers/components
   - existing work journal helpers/actions/components
   - relevant migrations/schema files
4. Determine exactly where employment data lives:
   - company_workers?
   - agency_workers?
   - invitations?
   - organizations?
   - engagement_contexts?
   - journal tables?
5. Decide minimal bridge.

## Preferred bridge fields

Use existing table names if present. Do not invent if the repo uses different names.

Possible additive fields on company/agency worker relationship tables:

```text
operations_role text nullable
operations_title text nullable
journal_review_scope text nullable
journal_review_enabled boolean default false
```

Allowed role values should be conservative:

```text
worker
foreman
project_manager
company_admin
agency_admin
not_enabled
```

But only implement values if they fit the existing project conventions.

## Contract requirements

The data contract must answer:

- who is this worker connected to?
- what operational role/title does this relationship claim?
- is journal review enabled for this relationship?
- is foreman/project-manager coordination enabled or only planned?
- what can be shown safely in UI?

## Acceptance criteria

- Smallest possible additive schema or documented no-migration decision.
- No fake data.
- No destructive DB change.
- Role/bridge values are conservative.
- Validation green.

## Validation

Run repo-appropriate migration validation plus:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

---

# PR B — Employment ↔ Journal Context Helper

## Goal

Create a pure helper that turns existing employment + journal data into an honest operational context.

## Possible output

```text
apps/web/lib/operations/employment-journal-context.ts
apps/web/lib/operations/employment-journal-context.test.ts
```

## Helper should compute

For a person/relationship:

- `relationshipType`: company / agency / none
- `operationsRole`: worker / foreman / project_manager / admin / not_enabled
- `journalReviewEnabled`: true/false
- `reviewCapability`: can_review / can_view / not_enabled
- `coordinationStatus`: active / partial / not_enabled
- `safeUiMessageKey`
- `nextAction`

## Rules

- Default to not enabled when fields are missing.
- Do not infer foreman/project-manager from text labels alone unless explicitly mapped.
- Do not grant review ability unless real role/context supports it.
- No AI.
- No external calls.
- No fake approvals.

## Acceptance criteria

- Pure helper tested with truth table.
- Safe default is conservative.
- UI can use helper without duplicating logic.

---

# PR C — Company/Agency Worker Role + Title Clarity

## Goal

Make company/agency worker surfaces clearly show current relationship, role/title, and what is not enabled.

## Tasks

1. Update existing company/agency dashboard worker panels.
2. Show:
   - worker/person
   - relationship type
   - operations role/title if real
   - review/coordination enabled/not enabled
   - one next action
3. If roles are not set yet, show honest message:
   - LT: `Operacinė rolė dar nepriskirta. Darbo žurnalo peržiūra šiam ryšiui dar neįjungta.`
   - EN: `Operational role is not assigned yet. Work journal review is not enabled for this relationship.`
4. Do not add fake assign buttons unless assignment is real.
5. Do not add destructive controls.

## Acceptance criteria

- Company/agency worker panels are clearer.
- Foreman/PM are not falsely active.
- LT/EN copy exists.
- Tests/guards where useful.

---

# PR D — Manual Work Journal Review Visibility

## Goal

Use the new context/helper to show a real manual review visibility path.

## Safe minimal version

If journal review is not actually enabled for employment links yet, show a read-only explanation and next setup action.

If enough existing journal review data exists, show:

- entries needing review
- worker
- relationship/context
- status
- one manual next action

## Required honesty

Use copy like:

LT:
- `Darbo žurnalo peržiūros ryšys su šiuo darbuotojo įmonės ryšiu dar neįjungtas.`
- `Peržiūra galima tik tada, kai darbuotojo ryšys ir žurnalo kontekstas sutampa.`

EN:
- `Work journal review is not yet connected to this worker-company relationship.`
- `Review is available only when the worker relationship and journal context match.`

## Do not add

- approve/reject buttons unless real server action + permission model exists
- fake review status
- fake manager assignment
- fake foreman review

## Acceptance criteria

- Admin/company can see whether journal review is connected or not.
- If not connected, the blocker is clear.
- If connected, only real entries/statuses are shown.
- No fake approvals.

---

# PR E — Foreman / Project Manager Foundation

## Goal

Prepare foreman/project-manager roles honestly.

## Safe version

If DB fields and permissions are still not enough, do not build dashboard. Instead:

- expose capability-map-driven status:
  - `foreman_not_enabled`
  - `project_manager_not_enabled`
- show what is required before enabling:
  - role assignment
  - team/project link
  - journal review scope
  - permissions
- add guard that prevents copy claiming active coordination.

## Stronger version

Only if previous PRs safely support it, add a minimal operations view:

- assigned relationship role
- review enabled/not enabled
- visible worker list if real
- recent work journal status if real
- one next action

## Acceptance criteria

- No fake foreman dashboard.
- No fake PM dashboard.
- Clear next data/permission requirements.
- Tests/guards.

---

# PR F — Ops Bridge Guards

## Goal

Prevent regression into fake operational claims.

## Add/extend guards for:

- no fake foreman/project-manager active copy unless helper says enabled
- no approve/reject UI unless real action/permission exists
- no automatic approval/verification claims
- no GPS/time tracking claims
- employment-journal helper imports no AI/external/payment packages
- all operation role values remain explicit/conservative

Do not overbuild. Guards must be useful and stable.

---

# Autonomy rules

Proceed autonomously when:
- changes are docs/code/UI/test only
- migration is small/additive and directly tied to this bridge
- no secrets
- no payment
- no outbound communication
- no destructive DB change
- no other repo touched
- tests are green
- PR scope remains small and clear

Stop and ask owner only if:
- migration would be destructive
- broad RLS redesign is needed
- production DB apply requires explicit separate confirmation
- paid provider/API is needed
- external outreach/send is requested
- implementation would require fake data or fake claims
- permission model could expose private data

---

# Branch naming

Use one branch per PR:

- `feat/ops-employment-journal-bridge-contract-v1`
- `feat/employment-journal-context-helper-v1`
- `feat/company-agency-worker-role-clarity-v1`
- `feat/work-journal-review-visibility-v1`
- `feat/foreman-pm-foundation-v1`
- `test/ops-bridge-truth-guards-v1`

---

# Validation baseline

For every code/UI/migration PR run:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

If repo has migration-specific checks, run them too.

If validation fails, report whether related or pre-existing on main.

---

# Final report format per PR

Keep reports short:

```text
Final report

1. PR URL:
2. Branch:
3. Commit SHA:
4. Files changed:
5. What changed:
6. What works now:
7. What is still not implemented:
8. Migration: none / additive file path / not applied / applied
9. Validation:
10. Safety:
11. Test URLs or docs path:
```

No huge evidence packs.

---

# End-of-cycle final report

At the end, report:

1. PRs opened
2. PRs merged
3. main HEAD
4. branches deleted/not deleted
5. migrations created/applied, if any
6. tests run
7. route/docs paths to check
8. what is now connected between company/agency employment and work journal
9. what is now clearer about worker/foreman/project-manager roles
10. what is still missing
11. whether the system is 100%, partial, or missing for:
    - company employment ↔ journal link
    - worker role/title clarity
    - company worker management
    - agency worker management
    - foreman/brigadier
    - project manager/site manager
    - work journal review visibility
12. safety confirmation
