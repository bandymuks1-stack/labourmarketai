# Owner-decision packets — 2026-09-15 (B1–B10 execution window)

Continuation of #1740. Every packet below is **prepared, dry-run on production
inside a rolled-back transaction, and UNAPPLIED**. None carries an approval
annotation, because none is approved. Apply only via Supabase MCP
`apply_migration`; never `db push`.

Journey truth after this window: **40 links = 34 LIVE / 6 BROKEN / 0 NOT_BUILT**
(was 30 / 10). `node .github/scripts/product-truth.mjs` prints the same.

## What merged nowhere yet — the PR stack

| PR | Class | Head | Why it waits |
|---|---|---|---|
| #1739 (existing draft) | RED by annotation rule | `8d458ba2` (reconciled onto main 2026-09-15) | Its two migrations are **already applied to production** (ledger `20260914144053`, `20260914144310`) and main lacks their files — **main ≠ production until it merges.** Full suite 23,139 green on the merged tree. Recommended disposition: **approve and merge** (squash). |
| B1–B10 branch `feat/cc/b1-b10-journeys` | RED (three prepared packets) | stacked on #1739's head | Opens as draft + `needs-human-gate` with #1739's branch as base; retarget to `main` after #1739 merges. Full suite 23,224 green; lint 0 errors; build below. |
| #1646 (existing draft, EVID-7) | RED | `24e8a1da` (reconciled onto main 2026-09-15) | Premise re-verified on production the same day (see B6). |

## The packets

### P-1 · B8 · `20260915120000_commitment_override_receipts_v1` (CAL-7, the missing half)

**Gap.** DETECT → WARN → ALTERNATIVES → DECIDE is real; nothing records that a
known clash was accepted deliberately. The assignment row is UPDATE-able with
no column for it; `audit_logs` is admin-only on INSERT and SELECT, so the
worker it protects could never read it.

**Adds.** One append-only table (trigger refuses UPDATE/DELETE, no write
policy), SELECT for the project's managers **or the worker themselves**, and
`record_commitment_override_v1` — requires a manager of THIS project and an
ACTIVE assignment, validates a closed collision shape, snapshots the window
from the project row. Guarded rollback.

**Dry-run (rolled back), 9 stages:** other company's manager 42501; worker not
on the project 22023; malformed collision 22023; right manager recorded and
read 1; **worker read 1 under own RLS**; other manager read 0; UPDATE and
DELETE refused 42501 even as owner; anon refused execute; 0 objects left.

**App half (ships with it, degrades honestly):** the receipt form under the
clash notice answers "prepared, not enabled" until applied; both parties read
the same rows (`OverrideReceiptsSection` on project operations and on the
worker's planning page).

### P-2 · B2 unit half · `20260915130000_project_team_assignments_v1` (WRK-6)

**Gap.** The brigade fan-out is LIVE (each member through the existing
`assign_worker_to_project`, each with their own calendar verdict). What the
product then knows is N assignments, not one act — nothing can end the brigade
as a unit and a brigade match has no object to point at.

**Adds.** `project_team_assignments` (+ which members the unit gave),
`assign_team_to_project_v1` (requires `can_manage_project` AND team owner;
each member still through the existing per-person RPC and its gates; refused
members do not abort the unit), `end_team_project_assignment_v1` (takes back
only what the unit gave, through `end_worker_project_assignment`). SELECT for
the project's managers, the team's owner and the team's **members**. No
external-brigade path (that needs E6 demand-scoped consent, still owner-blocked).

**Dry-run (rolled back), through the REAL `create_team_v1` and `add_org_member`:**
other manager 42501; owner assigns the unit, member assigned, idempotent;
member sees the unit under own RLS; outsider 0 and refused to end; owner's end
returns the member's assignment and marks the unit ended; anon refused. Residue:
0 teams, 3 active assignments (baseline), 0 objects.

### P-3 · B1/B5 · `20260915140000_competency_recognitions_v1` (SKL-9 / ARCH-2) — **legally significant**

**Gap.** "Five years of real work" reads as "certificate missing". The object
model now exists and is tested (`lib/skills/recognition-model.ts`: the five
SEP-6 states as a closed set; confirmed real work → DEMONSTRATED, never
RECOGNISED; the authority rule). The RECORD — an assessor's act — does not.

**Adds.** `competency_recognitions` (subject; requirement kind/key/country;
evidence entry ids snapshotted; assessor org + person; decision; validity;
revocation with reason; correction by superseding row) and two definer
commands enforcing: assessor-capable role (`training_provider`), actor manages
the assessor, **not the subject, not an organization engaging the subject**
(student relationship excepted), cited evidence must be the subject's own
**confirmed** work. SELECT for the subject always and the assessing
organization's managers — employers never read the table directly.

**Dry-run (rolled back), 10 stages:** employer `not_an_assessor_role`; stranger
`actor_does_not_manage_assessor`; the subject (who owns a training provider)
`self_recognition`; admin of an org engaging the subject
`beneficiary_organization`; non-confirmed entry 22023; independent institution
recorded on confirmed evidence and read 1; subject read 1; employer read 0 and
could not revoke; revoke without reason refused, with reason recorded; anon
refused. 0 objects left.

**Owner questions:** apply or decline; confirm `training_provider` as the
assessor-capable role for now (a sector/public-authority role can be added later).
No surface is shipped until applied — a control that answers 42501 to the one
person it exists for is worse than none.

### P-4 · B6 · #1646 `20260908110000_evidence_subject_dispute_v1` (EVID-7) — unchanged, reconciled

Premise re-verified on production 2026-09-15: `is_evidence_record_subject`
exists; **no** dispute RPC exists; `organization_evidence_events` has exactly
two INSERT policies (attest, verify), neither admitting a subject; the check
lacks `dispute_withdrawn`; 0 events. Apply or decline.

## Also resolved / corrected in this window

- **PER-11** was still listed as an open owner decision while #1740 had applied
  it (ledger `20260915042406`); verified on production and corrected to PARTIAL.
- **B4** (learner joins cohort) was BROKEN for "zero rows" — adoption, not a
  code gap. Walked on production under the real institution manager in a
  rolled-back transaction (`scripts/db-proof/b4-learner-joins-cohort.sql`). LIVE.
- **Privacy export**: widening the completeness guard to `subject_profile_id`
  found two records ABOUT the person the bundle had omitted
  (`experience_records`, `performance_reviews`) — now exported; two more
  withheld with reasons.
- **Deployment of main (`e781e140`)** independently verified: Vercel production
  deployment created 4 s after the merge, Ready, aliased to labourmarket.ai;
  `/api/health` → `{"ok":true,"build":"e781e140","checks":{"auth":ok,"db":ok}}`.

## Remaining HUMAN_UI_PROVEN walks (automation may not claim them)

B4 assign-learner button on `/dashboard/company`; B7 alternatives under a real
clash on `/dashboard/projects`; B10 forecast prefill on project operations
(needs ≥3 finished stages with actuals — production has 0); B2 team assign on
`/dashboard/company` (needs a real team — production has 0).
