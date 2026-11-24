# labourmarket.ai — Sales Core Nonstop Goal Plan

## One-paste command for Claude Code / agent

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

Read and execute this file as the controlling plan:
docs/goals/labourmarketai-sales-core-nonstop-v1.md

Goal:
Complete the real end-to-end sales-core chain until it is production-smoke-proven:

Company/Agency → Worker → Work Journal → Review Enabled → Manager Review → Evidence Result → Sales Offer

Nonstop rule:
Proceed step by step without asking for routine decisions. Stop only for a hard safety gate listed in the plan. Do not replace real implementation with docs, disabled UI, mock data, fake success states, or placeholder flows.
```

---

## Current known state

As of the latest owner/agent reports:

- PR #144 was merged into `main`.
  - Merge SHA: `333aba23e76c7aacc9d43aa2e625c3634cb6ba84`
  - Scope: journal-review enable toggle + per-row engagement read
  - Migration: `0033_journal_review_enable_toggle.sql`
- PR #145 was merged into `main`.
  - Merge SHA / final main SHA: `b4145fc1b3e3ceeb4240ab08d6a8baba74685d74`
  - Scope: manager review → persisted evidence result
  - Migration: `0034_manager_review_evidence_result.sql`
- Production database was reported to still end at migration `0032`.
- Therefore production is expected to need:
  1. `0033_journal_review_enable_toggle.sql`
  2. `0034_manager_review_evidence_result.sql`

The agent must re-verify these facts before touching production.

---

## Final target

The goal is complete only when a real production-smoke path is proven:

1. Company/Agency has or creates a real Worker relationship.
2. Owner/admin assigns required operations role if missing.
3. Owner/admin provisions the real engagement context.
4. Owner/admin enables Work Journal review using real `journal_review_enabled`.
5. Worker creates a real Work Journal entry tied to the correct context.
6. Manager/admin sees it as reviewable only because permissions and `journal_review_enabled=true` are real.
7. Manager/admin approves, rejects, or requests changes through real persisted review.
8. Worker/company/admin can see the evidence/review result.
9. Sales Offer page/block presents this as the first real working paid-pilot workflow using manual quote/contact CTA only.

---

## Non-negotiable rules

### Product truth

- No fake functions.
- No hardcoded success.
- No mock users, mock workers, fake projects, fake journal entries, or sample-only paths as proof.
- No hidden “coming soon” / disabled UI counted as done.
- No placeholder pretending to be working functionality.
- No approve/reject/review state unless persisted in the real database.
- No invented pricing.
- No billing activation.
- No payment provider.
- No AI/matching/trust claims unless already real and proven.
- No unrelated repos: no LABMA, no Agentai, no Vismantas.

### Code/data safety

- Do not delete existing working modules, routes, migrations, guards, or UI surfaces unless directly required and proven safe.
- Do not rewrite architecture unnecessarily.
- Additive DB changes only unless explicitly justified and owner-approved.
- Do not run destructive SQL.
- Do not change secrets/env.
- Do not touch package files or lockfile unless required and explained.
- Do not leave uncommitted production-critical changes.

### Progress rule

Do not stop after “foundation”, “guard”, “docs”, or “ready for later”.

Each step must move the real chain forward or prove it already works.

---

## Hard stop gates

Stop and report only if one of these occurs:

1. The working tree is dirty with unrelated changes before starting.
2. `origin/main` does not contain expected merge SHA `b4145fc1b3e3ceeb4240ab08d6a8baba74685d74` or later.
3. Production migrations do not match the expected state and the difference is not explainable.
4. Migration `0033` or `0034` file content differs from what was merged.
5. A migration contains destructive SQL (`DROP`, dangerous `DELETE`, broad `UPDATE`, RLS removal, table rename) not previously approved.
6. Required validation fails and cannot be fixed safely inside scope.
7. Applying migration 0033 or 0034 fails.
8. Production smoke would require fake data or unsafe mutation outside the approved pilot/test scope.
9. Any step requires billing/payment activation.

---

## Authorization boundary

The owner’s intent is to finish the sales-core workflow nonstop.

The agent is authorized to apply only these production migrations, in this exact order, after preflight verification:

1. `0033_journal_review_enable_toggle.sql`
2. `0034_manager_review_evidence_result.sql`

This authorization does **not** allow:

- any other migration,
- destructive SQL,
- schema rewrites,
- data deletion,
- payment activation,
- secret changes,
- unrelated repo changes.

If the agent’s local/remote facts do not match the current known state, stop and report before applying production SQL.

---

## Phase 0 — Preflight verification

Run and record:

```bash
git status --short
git branch --show-current
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git log --oneline -5 origin/main
```

Confirm:

- Repo path is exactly `C:\Users\Mano\Documents\labourmarketai`.
- Working tree is clean or contains only this plan file if the owner asked to commit it.
- `origin/main` contains:
  - `333aba2` / PR #144
  - `b4145fc` / PR #145
- Migration files exist:
  - `supabase/migrations/0033_journal_review_enable_toggle.sql`
  - `supabase/migrations/0034_manager_review_evidence_result.sql`

Inspect migrations for safety:

- no destructive SQL,
- no unrelated table rewrites,
- only intended functions/grants/audit-safe changes,
- `0034` depends logically on `0033`.

Run local validation before production DB work:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm -F web check:constitution
pnpm -F web test
```

If green, continue.

---

## Phase 1 — Confirm production migration state

Use the project’s approved Supabase migration inspection method.

Confirm production currently ends at `0032_engagement_context_provisioning_rpc` or otherwise does not yet include `0033`/`0034`.

Record:

- project id,
- latest applied migration,
- whether `0033` exists,
- whether `0034` exists.

Expected before apply:

```text
0033 not applied
0034 not applied
```

If `0033` is already applied but `0034` is not, only apply `0034` after verifying `0033` is correct.

If `0034` is applied without `0033`, stop.

---

## Phase 2 — Apply production migrations

Apply in exact order:

```text
1. 0033_journal_review_enable_toggle.sql
2. 0034_manager_review_evidence_result.sql
```

After `0033`, verify the expected RPCs/functions exist:

- `set_company_worker_journal_review`
- `set_agency_worker_journal_review`
- `company_worker_engagement_links`
- `agency_worker_engagement_links`

After `0034`, verify the expected RPCs/functions exist:

- `review_journal_entry`
- `reviewable_journal_entry_ids`

Then confirm migration list shows both applied in order.

If any SQL fails, stop. Do not patch production manually unless the patch is a minimal, reviewed continuation of the same migration and validation proves it safe.

---

## Phase 3 — Production deploy / runtime readiness

Confirm the web deployment containing final main SHA `b4145fc1` or later is live.

Check:

- deployment status,
- main SHA,
- production route availability.

Smoke routes should include at minimum the real app routes involved in:

- dashboard/company area,
- dashboard/agency area,
- Work Journal,
- journal inbox/review surface,
- pricing/sales offer route once created.

If app deploy is not yet live but CI/deploy is running, inspect current status through the repo’s approved deployment mechanism. Do not claim production is ready until the live app is confirmed.

---

## Phase 4 — Real relationship setup smoke

Use the safest existing seed/UAT/owner-approved production data path.

Do not invent fake customers or fake workers as proof.

Prove or create a controlled real test relationship:

```text
Company/Agency → Worker
```

Required checks:

- worker profile exists,
- company/agency relationship exists,
- owner/admin has permission,
- operations role can be assigned if required,
- engagement context can be provisioned,
- relationship row shows real engagement linked state.

If there is no safe existing test relationship, create only the minimal owner-approved UAT relationship using existing app/admin mechanisms. Mark it clearly as UAT/internal if the product supports that. Do not pollute real customer data.

---

## Phase 5 — Review Enabled smoke

Using the real relationship:

1. Assign valid role if needed.
2. Provision engagement context.
3. Enable Work Journal review.
4. Re-read the row from the UI/server.
5. Confirm `journal_review_enabled=true`.
6. Confirm the UI does not show fake or disabled review controls as complete.

Expected proof:

```text
Review Enabled is active because:
- real engagement context exists,
- real role/permission gate passed,
- real journal_review_enabled flag is true.
```

---

## Phase 6 — Worker Work Journal entry smoke

As the worker or through the approved owner/test path:

1. Create a real Work Journal entry.
2. Ensure it is tied to the correct worker/context.
3. Ensure it is visible in the worker’s Work Journal.
4. Confirm no fake skill/evidence state is created prematurely.

Expected:

```text
Worker → Work Journal
```

is real and persisted.

---

## Phase 7 — Manager Review smoke

As manager/admin with real permission:

1. Open the journal inbox/review surface.
2. Confirm only reviewable entries are listed.
3. Confirm the entry appears because `journal_review_enabled=true`.
4. Submit one real review decision:
   - approved, or
   - rejected, or
   - changes_requested.
5. Confirm a real `journal_entry_confirmations` row exists.
6. Confirm audit log was created if expected by migration.
7. Confirm unauthorized user cannot review.

Expected:

```text
Manager Review
```

is persisted through the real RPC/action path.

---

## Phase 8 — Evidence Result smoke

Confirm the review result is visible to all correct audiences:

- worker,
- company/agency admin,
- manager/admin.

Confirm blocked audiences cannot see it.

Expected result states:

- approved,
- rejected,
- changes_requested.

Confirm `changes_requested` does not count as approval/confirmation.

Expected:

```text
Evidence Result
```

is visible, persisted, permission-safe, and not fake.

---

## Phase 9 — Sales Offer implementation

Only after Phases 4–8 pass.

Implement a real Sales Offer / manual quote pilot CTA based on the working flow.

Scope:

- public sales/pricing/landing block or page,
- app/dashboard upgrade/pilot CTA if appropriate,
- no payment activation,
- no checkout,
- no invented prices,
- no fake “AI matching” claim,
- no “fully automated” claim,
- no claim that features outside this chain are live.

Sales copy must honestly say the first pilot workflow includes:

```text
Company/Agency worker relationship
Work Journal review enablement
Manager review
Evidence/review result
Manual pilot activation / quote
```

CTA should be:

```text
Request pilot
Contact us
Manual quote
```

or the project’s existing equivalent.

Do not add plan purchase buttons.

Do not use “buy now” unless billing is actually live.

---

## Phase 10 — Sales Offer validation

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm -F web check:constitution
pnpm -F web test
```

Add/verify tests:

1. Sales offer does not mention fake billing.
2. Sales offer does not mention invented pricing.
3. Sales offer does not claim AI/matching/trust automation unless live.
4. Sales offer points to manual quote/contact.
5. Relevant public/app routes render.
6. Existing review/evidence tests remain green.

If code changes are needed, commit, push, open PR, merge only if green.

If this is small and policy allows direct PR, still do it through a PR.

---

## Phase 11 — Final production smoke

After Sales Offer is merged and deployed:

Prove full chain:

```text
Company/Agency → Worker → Work Journal → Review Enabled → Manager Review → Evidence Result → Sales Offer
```

Required evidence in final report:

- final main SHA,
- production deploy SHA,
- migration status: 0033 applied, 0034 applied,
- route smoke results,
- test/UAT relationship used,
- journal entry id or safe redacted identifier,
- review decision result,
- evidence visibility proof,
- Sales Offer route/block proof,
- confirmation no billing/payment was activated,
- confirmation no fake/mock data was used as proof,
- confirmation no unrelated repo was touched.

Use redacted IDs where needed. Do not print private personal data.

---

## Final report format

The final report must be concise and factual:

```text
Final Report — labourmarket.ai Sales Core Chain

Status:
DONE / BLOCKED

Main SHA:
...

Production deploy SHA:
...

Migrations:
0033 applied: yes/no
0034 applied: yes/no

End-to-end chain:
Company/Agency → Worker: proven / blocked
Worker → Work Journal: proven / blocked
Review Enabled: proven / blocked
Manager Review: proven / blocked
Evidence Result: proven / blocked
Sales Offer: proven / blocked

Validation:
typecheck:
lint:
build:
constitution:
tests:

Safety:
No fake functions:
No mock data:
No billing activation:
No invented pricing:
No unrelated repos:
No destructive SQL:

Remaining:
Only list genuine blockers.
```

---

## Definition of done

This sprint is done only when:

```text
Company/Agency → Worker → Work Journal → Review Enabled → Manager Review → Evidence Result → Sales Offer
```

is proven on production or the final report clearly identifies the exact hard blocker preventing production proof.

Anything less is not done.
