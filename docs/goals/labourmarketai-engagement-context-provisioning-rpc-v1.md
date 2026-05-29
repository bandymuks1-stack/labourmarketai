# Labourmarket.ai — Engagement Context Provisioning RPC v1

## Owner paste command

After downloading this MD file, paste this to the agent:

```text
/goal
Project/repo: labourmarket.ai
Working directory: C:\Users\Mano\Documents\labourmarketai

GOAL: Execute the downloaded MD plan file exactly.

The owner downloaded this file locally:
labourmarketai-engagement-context-provisioning-rpc-v1.md

First locate the file on disk.

Likely paths:
- C:\Users\Mano\Downloads\labourmarketai-engagement-context-provisioning-rpc-v1.md
- C:\Users\Mano\Documents\labourmarketai-engagement-context-provisioning-rpc-v1.md
- C:\Users\Mano\Desktop\labourmarketai-engagement-context-provisioning-rpc-v1.md

Required first steps:
1. Find the MD file.
2. Copy it into the repo:
   C:\Users\Mano\Documents\labourmarketai\docs\goals\labourmarketai-engagement-context-provisioning-rpc-v1.md
3. Read the copied file fully.
4. Treat it as the source of truth.
5. Work for one long autonomous cycle.
6. Do not ask the owner questions unless a real blocker appears.
7. Open PRs when useful.
8. Merge only when current autonomy policy allows it and all checks are green.
9. If this creates a migration, do NOT apply it to production unless owner explicitly approves after PR review.
10. Keep final report short.

Do not touch LABMA, Agentai, Vismantas, or other repos.
Do not run bare pnpm install.
```

---

# Main goal

Build the next safe slice after PR #141:

```text
employment relationship
→ engagement_context connection/provisioning
→ bridge-ready state
→ later journal_review_enabled can be enabled safely
```

This PR must create the safe foundation for connecting company/agency worker relationships to the existing work journal ORG model.

---

# Current known state

Latest relevant history:

- PR #137 merged and migration 0031 applied.
- PR #139 merged: owner/admin role-select UI exists for company/agency worker rows.
- PR #141 merged as `127cce2`: engagement-context ops bridge v1.
- PR #141 added read-only classifier/UI:
  - `apps/web/lib/operations/engagement-bridge.ts`
  - `computeEngagementBridgeReadiness`
  - `EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE=false`
- PR #141 found:
  - journal review chain is real on the ORG model:
    - `organizations`
    - `engagement_contexts`
    - `manages_organization`
  - employment links are not connected because M1 left worker contexts with `organization_id = NULL`.
- Review toggle explains exact blocker.
- Review is not active.
- Foreman/PM are not reviewers.
- No approve/reject UI exists.
- No migration/RPC was added in PR #141.

Current missing piece:

```text
A safe provisioning RPC that connects an enabled employment relationship
to a real journal engagement_context / organization review model.
```

---

# Hard truth rule

Do not claim review is active until a real connection exists and helper says `reviewActive`.

Do not enable `journal_review_enabled` in this PR unless all required ownership, organization, engagement_context and permission conditions are real and verified.

Preferred safe result for this PR:

```text
provisioning RPC exists
→ creates/connects required context safely
→ audit logs the write
→ UI can show bridge-ready
→ review toggle remains disabled unless the bridge is truly ready
```

The next PR can then enable the review toggle if this PR proves the connection works.

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
- fake users
- fake companies
- fake workers
- fake projects
- fake work journal entries
- fake approvals/reviews
- AI/OCR/PDF integrations
- paid API integration

Do not implement:
- payroll
- automatic matching
- automatic candidate offers
- automatic work confirmation
- fake verification/reputation
- fake GPS/time tracking
- fake productivity scoring
- approve/reject buttons

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
- review active, unless real helper state proves it

---

# Critical dependency warning

Do not run bare `pnpm install`.

A previous task reported that bare `pnpm install` in this repo pruned `node_modules` and transiently clobbered `apps/web` in a multi-worktree/shared store setup.

If dependencies are broken:
1. Stop and report, or
2. Only run `pnpm install --frozen-lockfile` after confirming:
   - clean working tree
   - no uncommitted WIP
   - owner/autonomy policy allows it

Commit/checkpoint WIP frequently.

---

# Work strategy

Use one focused PR unless discovery proves it must split.

Recommended branch:

```text
feat/engagement-context-provisioning-rpc-v1
```

Possible PR scope:
1. read existing ORG/journal model
2. decide minimal safe provisioning contract
3. add additive migration/RPC if needed
4. add pure helper/read model update
5. add UI copy showing “bridge ready” only when real
6. add tests/guards
7. open PR, no production migration apply without owner approval

---

# Step 1 — Repo and current-state inspection

Tasks:
1. Pull latest `origin/main`.
2. Confirm main includes PR #141 (`127cce2`) or newer.
3. Confirm clean working tree.
4. Read:
   - `docs/decisions/engagement-context-ops-bridge-v1.md`
   - `docs/contracts/employment-journal-bridge-contract-v1.md`
   - `docs/contracts/operations-role-assignment-v1.md`
   - `docs/audits/work-journal-review-chain-current-state-v1.md`
   - `docs/decisions/next-ops-implementation-after-migration-0030.md`
   - `apps/web/lib/operations/engagement-bridge.ts`
   - `apps/web/lib/operations/employment-journal-context.ts`
   - `apps/web/lib/operations/assign-operations-role.ts`
   - company/agency dashboard and worker section files
   - relevant migrations for organizations, engagement_contexts, manages_organization, company_workers, agency_workers, audit_logs

Output:
- internal notes only unless a blocker appears.

---

# Step 2 — Bridge provisioning decision

Create a short decision doc:

```text
docs/decisions/engagement-context-provisioning-rpc-v1.md
```

It must answer:
- what is the existing journal ORG model?
- what data must exist to connect an employment relationship?
- which table/columns identify the worker relationship?
- how is owner/admin permission revalidated?
- what should the RPC create or connect?
- what must not be created?
- when is bridge-ready true?
- when is review active true?
- what remains deferred?

Acceptance:
- concrete file/table/function evidence
- no fake claims
- no implementation promises beyond this PR

---

# Step 3 — Safe provisioning RPC / migration

If needed, create a small additive migration.

Suggested migration name:

```text
supabase/migrations/0032_engagement_context_provisioning_rpc.sql
```

Possible RPC names:

```text
provision_company_worker_engagement_context
provision_agency_worker_engagement_context
```

Required RPC rules:
- `SECURITY DEFINER`
- `search_path=public`
- ownership/admin revalidation
- reject if relationship not found
- reject if role is not assigned
- reject if operations role is not allowed for review setup
- reject if worker/profile link missing
- reject if required organization/engagement context cannot be identified safely
- do not create fake worker/project/work journal entries
- do not approve/reject any journal entry
- do not set `journal_review_enabled=true` unless explicitly safe and fully justified
- append audit log if repo has the established pattern
- no broad RLS/grant redesign
- revoke public execute
- grant execute only to authenticated if repo pattern requires it

Preferred conservative behavior:
- RPC provisions/connects the context and records audit.
- It does NOT enable review.
- It makes the relationship bridge-ready.
- A later PR enables review after UI + guard confirms readiness.

Disallowed:
- DROP
- RENAME
- destructive UPDATE/backfill
- fake backfill
- granting broad table privileges
- changing payment/auth broadly

---

# Step 4 — Helper/read-model update

Update or extend:

```text
apps/web/lib/operations/engagement-bridge.ts
```

Requirements:
- `connected` only when real context exists.
- `bridgeReady` true only when the employment relationship is actually connected to journal context.
- `reviewActive` true only when both bridge-ready and review-enabled are true.
- foreman/PM can never become active from role label alone.
- safe default remains not enabled.

If the PR only adds RPC and no read path can see the new connection yet, document and test that the state remains `missing_engagement_context` until the read path lands.

---

# Step 5 — UI copy and disabled toggle behavior

Update company/agency worker UI only where useful.

Requirements:
- review toggle remains disabled unless review is genuinely allowed
- show exact blocker
- if provisioning can be run from UI, make it owner/admin-only and clearly named
- if provisioning UI is not built yet, show a setup-needed message only

LT copy examples:
- Darbo žurnalo kontekstas dar nesujungtas.
- Sujungti galima tik po saugaus savininko veiksmo.
- Paruošta peržiūros nustatymui.
- Peržiūra dar neaktyvi.

EN copy examples:
- Work journal context is not connected yet.
- It can be connected only through a safe owner action.
- Ready for review setup.
- Review is not active yet.

Do not show:
- Review active
- Patvirtinta
- Verified
- approve/reject buttons
- fake reviewer labels

unless real state supports it.

---

# Step 6 — Tests and guards

Required tests:

1. Helper truth-table tests:
   - no relationship
   - role not assigned
   - role label alone
   - missing engagement context
   - bridge ready but review disabled
   - connected/review active only if all conditions real

2. RPC SQL guard if migration added:
   - functions are SECURITY DEFINER
   - public execute revoked
   - owner/admin revalidation exists
   - invalid states rejected
   - no broad RLS/grant changes
   - no fake data insert/backfill

3. UI/guard:
   - no active review copy unless helper says active
   - no approve/reject UI
   - no fake foreman/PM reviewer claim
   - no AI/payment/external imports in ops bridge helpers

---

# Step 7 — Validation

Run:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
pnpm -F web check:constitution
pnpm vitest run
```

If migration is added, also run repo migration/schema guard if available.

If `check:db-validation-readiness` fails because CLI is prod-linked, do not bypass it and do not run production DB commands.

---

# Step 8 — PR and merge rules

Open PR against main.

Merge only if:
- current autonomy policy allows it
- checks are green
- no owner-gated migration apply is required before merge
- no production DB apply is performed without separate owner approval

If Supabase Preview check is cancelled/skipped due existing integration behavior, report it honestly and follow the repo’s current policy.

Do not apply production migration in this task unless owner separately approves after PR review.

---

# Final report format

Keep final report short:

```text
Final report

1. PR URL:
2. Branch:
3. Commit SHA:
4. Files changed:
5. Migration/RPC:
6. Provisioning decision:
7. What now works:
8. What remains blocked:
9. Validation:
10. Safety:
11. Next recommended PR:
```

---

# Expected next PR after this one

If this provisioning PR succeeds but does not enable review:

```text
feat/journal-review-enable-toggle-v1
```

Expected purpose:
- owner/admin can enable `journal_review_enabled=true`
- only if engagement bridge is connected
- review toggle becomes active
- foreman/PM reviewer activation still guarded by capability map and actual permissions
