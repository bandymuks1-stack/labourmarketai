# Human gate — Management Decisions v1 (`20260817232000`)

Status: **PENDING APPLY BY LEAD**
Route pre-approved by the owner mandate 2026-08-17 (autonomous functional
completion train V2, §4 migration authority).

## What is being asked for

Apply `supabase/migrations/20260817232000_management_decisions_v1.sql` to
production via Supabase MCP `apply_migration`, **after**
`20260817130000_workflow_engine_v1.sql` and
`20260817140000_document_file_layer_v1.sql`, and with the already-applied
`20260711210000_work_tasks_v1.sql` in place. All three are asserted in the
migration body — it aborts rather than half-applying.

## Why it is migration-safety RED

4 new RLS-bearing tables, SELECT policies, GRANT/REVOKE, 8 SECURITY DEFINER
functions and 1 append-only trigger guard. Every object is a NEW name;
nothing existing is modified or recreated; zero DML at apply time. **No
workflow, document or task row is ever written by this module.**

## What it deliberately does not build

1. **Approval / voting.** The existing Workflow & Approval Engine is the
   only approval machinery. A vote IS an engine step: `approval_mode = 'all'`
   over an approver set is a unanimous vote, `'any'` is first-answer-carries,
   `'single'` is one named decider. This module has no ballot table, no tally
   column, no quorum arithmetic and no decide command. It only mirrors the
   engine's status onto the decision row, and only ever from the engine's own
   truth: `submit` refuses unless a real pending instance for this decision
   exists, and `sync` is idempotent read-repair from the terminal state.
2. **Tasks.** Follow-up work is a real `work_tasks` row created through the
   existing task RPCs from the tasks surface. `decision_task_links` stores a
   pointer and copies no title, status, assignee or due date.
3. **Documents.** Agendas, minutes and attachments are existing
   `org_documents` rows; `decision_document_links` stores a pointer.

## Nav-guard correction (recorded honestly)

The reality audit's OPERATIONS row said "management decisions | MISSING |
nav guard actively excludes it". That evidence was re-checked file by file
for this train.

The only matching assertion in the repo is in
`apps/web/lib/guards/public-nav-canonical.test.ts`:

```ts
expect(Object.values(n)).not.toContain("Ištekliai");
expect(Object.values(n)).not.toContain("Sprendimai");
```

Its scope is the **public marketing header** (`nav.*` labels in the lt/en/ru
catalogs), and there "Sprendimai" is the leftover site-template label
**"Solutions"** — paired with "Ištekliai" = "Resources", and removed by the
sibling assertion that strips the template keys `solutions` / `resources` /
`company` / `platform`. It has nothing to do with a management-decisions
dashboard surface. There is no occurrence anywhere in `apps/web` of a
management-decisions route, feature key, module id or nav entry.

**Conclusion: nothing excluded the surface. It was simply never built.** The
guard was NOT weakened — it stays exactly as strict as it was — and this
train ships the surface as a SECTION on the EXISTING `/dashboard/network`
route, beside the approvals section it depends on. No navigation item, no
feature flag and none of the three frozen primary-nav arrays are touched.

## Proof

`scripts/db-proof/training-development-v1.sh` — the decision sections of the
127/127 run, including the full round trip: submitting without a real engine
instance is refused and the mirror stays `draft`; a result cannot be recorded
before the engine approves; a two-approver `all` step is cast through the
engine's own commands and only the second approval settles it; `sync` copies
the terminal truth and is idempotent; a cross-org document and a task the
caller does not own are both refused; the ledger is append-only against the
superuser.

## Rollback

`supabase/rollbacks/20260817232000_management_decisions_v1.down.sql` —
**refuses while real rows exist**.
