# Labourmarket.ai — Company / Worker / Foreman Operations Truth + Build v1

## Owner paste command

After downloading this MD file, paste this to the agent:

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

GOAL: Execute the downloaded MD plan file exactly.

The owner downloaded this file locally:
labourmarketai-company-worker-foreman-ops-cycle-v1.md

First locate the file on disk.

Likely paths:
- C:\Users\Mano\Downloads\labourmarketai-company-worker-foreman-ops-cycle-v1.md
- C:\Users\Mano\Documents\labourmarketai-company-worker-foreman-ops-cycle-v1.md
- C:\Users\Mano\Desktop\labourmarketai-company-worker-foreman-ops-cycle-v1.md

Required first steps:
1. Find the MD file.
2. Copy it into the repo:
   C:\Users\Mano\Documents\labourmarketai\docs\goals\labourmarketai-company-worker-foreman-ops-cycle-v1.md
3. Read the copied file fully.
4. Treat it as the source of truth.
5. Work for one long autonomous cycle.
6. Do not ask the owner questions unless a real blocker appears.
7. Open PRs when useful.
8. Merge only when current autonomy policy allows it and all required checks are green.
9. Keep final reports short.

Do not invent a different project. Do not touch LABMA, Agentai, Vismantas, or other repos.
```

---

# Main goal

Shift labourmarket.ai from buyer-request progress to the missing core operations layer:

```text
company
→ workers
→ roles
→ foreman / brigadier
→ project manager / site manager
→ teams / projects
→ work journal
→ review / confirmation
→ admin operational status
```

The owner’s concern is explicit:

> Buyer/admin request workflow moved forward, but are worker, work journal, company worker management, foreman/brigadier and site-manager coordination 100% functional?

This cycle must answer that truthfully and start fixing the most valuable gaps.

Current known state:
- Recent buyer/admin request cycles ended at main HEAD `7f6b0b2`.
- Buyer request workflow is now strong.
- Company/worker/foreman/work-journal coordination still needs truth audit and build work.
- Do not claim “100% working” unless proven by actual routes, code, DB helpers, permissions and tests.

---

# Hard truth requirement

Classify every inspected area as one of:

- `real_working`
- `partial_working`
- `ui_only`
- `planned_only`
- `missing`
- `unclear_needs_manual_check`

For every claim, cite repo evidence:
- route path
- file path
- component/helper name
- server action/API function
- table/schema/migration if relevant
- test/guard if relevant

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
- Supabase storage policies unless absolutely necessary
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

# Work strategy

Use small PRs. Do not create one monster PR.

Recommended sequence:

1. PR A — Operations Truth Audit
2. PR B — Role Hierarchy / Access Truth Map
3. PR C — Company Worker Management Clarity
4. PR D — Work Journal Review Chain Foundation
5. PR E — Foreman / Project Manager Operations View
6. PR F — Guard/test hardening if useful

If the audit proves a later PR is impossible or unsafe without a DB migration, stop and report clearly instead of faking it.

---

# PR A — Operations Truth Audit

## Goal

Answer:

```text
Is labourmarket.ai already a real company/worker/foreman/work-journal coordination system,
or only separate pieces?
```

## Tasks

1. Pull latest origin/main.
2. Confirm main is `7f6b0b2` or newer.
3. Search repo for:
   - worker
   - company
   - company worker
   - agency worker
   - foreman
   - brigadier
   - project manager
   - site manager
   - work journal
   - timesheet
   - project
   - team
   - role
   - invitation
   - review
   - approval
   - confirmation
4. Inspect relevant routes/components/helpers/actions/guards/messages/migrations.
5. Create:
   `docs/audits/company-worker-foreman-operations-truth-v1.md`

## Audit sections

Include:

### 1. Current route inventory

List relevant routes for:
- worker
- company
- admin
- buyer/customer
- work journal
- projects
- team/employees
- invitations
- role switching
- manual review

### 2. Current data model inventory

List tables/schema/migrations or DB helpers related to:
- profiles/users
- profile roles
- customers
- companies
- agency workers
- company workers
- invitations
- projects
- work journal entries
- requests
- attachments

If missing, say missing.

### 3. Current role map

Classify:
- worker
- company admin
- foreman / brigadier
- project manager / site manager
- buyer/customer
- admin/superadmin

For each role:
- exists in code/data?
- route?
- distinct permissions?
- distinct UI?
- what can it actually do?

### 4. Work Journal truth

Answer:
- can a worker create a work journal entry?
- where?
- is it persisted?
- can company/admin/foreman see it?
- is there review status?
- can it be approved/rejected?
- is it connected to skills/evidence?
- what is real, partial, missing?

### 5. Company worker management truth

Answer:
- can company see workers?
- can company invite workers?
- can company assign roles?
- can it distinguish worker/foreman/manager?
- can it remove/disable people?
- can it see pending invitations?
- what is real, partial, missing?

### 6. Foreman / project manager truth

Answer:
- does foreman/brigadier exist as a real role?
- does project manager/site manager exist as a real role?
- can either see a team?
- can either review work entries?
- can either coordinate daily work?
- is this only planned/copy/UI?

### 7. Top gaps

List top 5 gaps ordered by product value and implementation safety.

### 8. Recommended PR sequence

Give 3–5 small PRs that should follow.

## Acceptance criteria

- Audit is honest and concrete.
- No implementation beyond docs unless a tiny guard is needed.
- No fake claims.
- Audit clearly says whether each area is 100%, partial, missing, or UI-only.

## Validation

Run at minimum:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
```

---

# PR B — Role Hierarchy / Access Truth Map

Only start after PR A is merged or clearly open and green.

## Goal

Make role hierarchy visible and less ambiguous without pretending unavailable roles work.

## Tasks

1. Inspect existing role constants/types/helpers.
2. Create or update a pure role capability helper if appropriate.
3. Add a role capability map for:
   - worker
   - company admin
   - foreman / brigadier
   - project manager / site manager
   - buyer/customer
   - admin
4. If a role is not implemented, mark it `not_enabled` or `planned`, not active.
5. Add tests.

Possible output:
- `apps/web/lib/operations/role-capabilities.ts`
- `apps/web/lib/operations/role-capabilities.test.ts`
- audit/docs update

Acceptance:
- One clear place explains current operational roles.
- Foreman/project manager are not falsely shown as fully functional.
- Tests cover the map.
- No migration unless absolutely necessary.

---

# PR C — Company Worker Management Clarity

Only start if audit shows an existing company/worker surface.

## Goal

Company/admin should understand current worker relationships and next actions.

## Tasks

1. Find existing company/worker management route or admin surface.
2. Improve clarity using existing data only.
3. Show:
   - worker/person
   - role/status if available
   - invitation/relationship status if available
   - one next action
   - whether role coordination is enabled or not enabled
4. Do not add fake worker data.
5. Do not add fake invite/send flows.
6. Do not add destructive actions.

Acceptance:
- Company/admin worker management is clearer.
- It does not claim foreman/project manager coordination works unless real.
- LT/EN copy if visible text changes.
- Tests/guards where useful.

---

# PR D — Work Journal Review Chain Foundation

Only start if there is enough existing work journal foundation.

## Goal

Connect worker work entries to a visible manual review chain.

Minimal intended truth:

```text
worker submits/has work entry
→ responsible reviewer/company/admin can see it
→ entry has a review/readiness state or manual review explanation
→ one next action is visible
```

## Tasks

1. Inspect existing work journal implementation.
2. Identify whether entries are persisted and where shown.
3. Add deterministic review-readiness helper if useful.
4. Add small review queue/status block only if existing data supports it.
5. Keep it manual-review-only.
6. Do not invent approvals if approval status does not exist.

Possible statuses:
- `submitted`
- `needs_review`
- `reviewed`
- `missing_details`
- `manual_review_only`
- `not_enabled`

Acceptance:
- Work journal review chain is more visible.
- Honest about manual/not enabled.
- No fake approvals.
- No fake skill confirmation.
- No fake GPS/time tracking.

---

# PR E — Foreman / Project Manager Operations View

Only start if role/data support is sufficient.

## Goal

Create the first honest operations view for foreman/project-manager coordination.

Safe minimal version:
- If foreman/project-manager roles are not real yet, create an honest `not enabled / role design` surface or doc-backed placeholder, not a fake dashboard.
- If role support exists, show:
  - my team / assigned people if real
  - today/recent work entries if real
  - pending manual reviews if real
  - project/team relation if real
  - one next action

Acceptance:
- Foreman/project-manager state is clearer.
- No fake team/project/work data.
- No fake dashboard metrics.
- No fake coordination.
- If not enabled, UI says not enabled clearly.

---

# PR F — Guard/test hardening

## Goal

Prevent future false claims around worker/company/foreman/work-journal operations.

Possible guards:
- no fake “fully working” claims for foreman/project manager
- no fake approval/verification words unless backed by real status
- work journal review helpers do not import AI/GPS/payment/external packages
- role capability map statuses remain explicit
- no public-facing copy says automatic coordination is active unless implemented

Do only what is useful and not brittle.

---

# Autonomy rules

Proceed autonomously when:
- changes are docs/code/UI/test only
- no DB migration
- no secrets
- no payment
- no outbound communication
- no production destructive action
- no other repo touched
- tests are green
- PR scope remains small and clear

Stop and ask owner only if:
- DB migration becomes necessary
- Supabase policy change becomes necessary
- paid provider/API is needed
- external outreach/send is requested
- implementation would require fake data or fake claims
- permission model is ambiguous and could expose private data

---

# Branch naming

Use one branch per PR:

- `audit/company-worker-foreman-ops-truth-v1`
- `feat/ops-role-capability-map-v1`
- `feat/company-worker-management-clarity-v1`
- `feat/work-journal-review-chain-v1`
- `feat/foreman-project-manager-ops-view-v1`
- `test/ops-truth-guards-v1`

---

# Validation baseline

For every code/UI PR run:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

For docs-only PR run at minimum:

```bash
pnpm -F web typecheck
pnpm -F web lint
```

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
6. Truth found / what works now:
7. What is still not implemented:
8. Validation:
9. Safety:
10. Test URLs or docs path:
```

No huge evidence packs.

---

# End-of-cycle final report

At the end, report:

1. PRs opened
2. PRs merged
3. main HEAD
4. branches deleted/not deleted
5. tests run
6. route/docs paths to check
7. what is now clear about company/worker/foreman/work-journal operations
8. what is now improved in product
9. what is still missing
10. whether the system is 100%, partial, or missing for:
    - worker
    - company worker management
    - foreman/brigadier
    - project manager/site manager
    - work journal
    - review/approval chain
11. safety confirmation
