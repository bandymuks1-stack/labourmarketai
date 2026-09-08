# G-01 — the operational loop, walked end to end

**Date:** 2026-09-01
**Baseline:** `main = f3c227ea = production` · tree clean · CI green
**Database:** production (`gorgitwvdzxbnaxhrsrw`), probed inside a transaction
that rolls itself back. **Zero rows were added to production.**
**Status of this document:** finding + owner decision. **No fix has been
applied, merged, or proposed for merge.**

---

## 1. What was asked

Close one real operational loop end to end:

```
interest → booking → engagement → assignment → work object → hours
        → split allocation → timesheet → submit → review → approve
```

with the split-hours case **8 h → Object 01, 2 h → Object 05, total 10 h**,
producing two correct canonical allocation lines with provenance.

## 2. Method

`scripts/db-proof/g01-operational-loop.sql` walks the loop **twice** in one
transaction, calling the same production RPCs the web / chat / MCP clients
call, as the same two actors, under the same RLS (`set local role
authenticated` + a transaction-local `request.jwt.claims`). No gate is patched
and nothing is re-implemented — the probe measures the product as deployed.

- **Pass 1** — the world as it ships: the worker reaches the organization only
  through the booking loop.
- **Pass 2** — the identical walk plus **one row**: the canonical
  person↔organization relationship of DOCTRINE §5.5, `engagement_contexts`,
  using the **existing** registry slug `freelancer`. No DDL, no new table.

The two passes use disjoint synthetic identities (`9901*` / `9902*`). The
transaction ends in a deliberate `raise exception`, so it cannot commit; the
exception message is the report. `g01-operational-loop.residue.sql` verifies
afterwards.

Nothing was seeded that the loop is supposed to produce: in particular **no
`company_workers` roster row**, so the assignment stage had to pass on the
booking arm alone.

## 3. Result

| Stage | Pass 1 (as shipped) | Pass 2 (+ relationship row) |
|---|---|---|
| S1 interest | ✅ | ✅ |
| S2 booking proposed | ✅ | ✅ |
| S3 engagement created | ✅ `{"engagement":"created"}` | ✅ |
| S4 assignment | ✅ **on the booking arm alone** | ✅ |
| S5 two work objects | ✅ `created` / `created` | ✅ |
| S6 split hours | ✅ 2 rows, **10.00 h** | ✅ 2 rows, **10.00 h** |
| S7 timesheet | ❌ **`not_found`** | ✅ 2 lines, **10.00 h** |
| S8 approval template | ✅ `installed` | ✅ |
| S8b worker reads template (web path) | ❌ **0 visible** | ✅ 1 definition, 1 published version |
| S9 submit | ❌ `not_found` / `invalid` | ✅ instance started, `submitted` |
| S10 review + approve | ❌ cascade | ✅ instance `approved` |
| S11 decision lands on document | ❌ cascade | ✅ timesheet `approved` |

**The split-hours requirement is satisfied in both passes**, because the hours
half never depended on the missing link:

```
G-01 Object 01   8.00 h   2026-09-01   source=manual  status=recorded
G-01 Object 05   2.00 h   2026-09-01   source=manual  status=recorded
                ───────
                10.00 h   across 2 canonical rows
entered_by = the employer · organization matches · neither row superseded
```

In pass 2 the timesheet snapshot carries both lines with full provenance —
`derivedFrom: "work_hour_allocation"`, `allocationId`, `objectTitle`,
`projectTitle` — under `source: "work_hour_allocations+journal_entry_metrics"`.

> **On totals.** `lines_snapshot` stores `lines` + `source` only; `totalHours`
> and `lineCount` are derived in the app (`deriveTimesheetTotals`,
> `lib/timesheets/timesheets-model.ts`). The probe derives them the same way —
> summing `value` over `unit = 'hours'` — rather than reading keys the snapshot
> does not contain and calling a null a pass.

## 4. Root cause

`belongs_to_organization(org)` recognises **two** relationships:

```sql
engagement_contexts (profile, org, status='active')
company_memberships (profile, org, status='active')
```

The booking loop creates **neither**. On accept, `respond_booking_request_v3`
writes `company_worker_engagements` — company-scoped, mapped to the
organization only indirectly through `organizations.legacy_company_id`.

So a worker who reached the organization **through booking** is not "of" that
organization for the hours / timesheet / approval layer. Measured, as the
worker, in pass 1:

```
owns_worker               = true
belongs_to_organization   = false     ← the break
manages_organization      = false
is_org_member_or_engaged  = false
```

`create_timesheet_v1` returns `not_found` on exactly that predicate, and
`start_workflow_instance_v1` gates on the same one. Nothing else in the chain
is missing: every other stage passed, unchanged, in both passes.

**One predicate, two RPCs and one RLS policy stand between the product and a
closed operational loop.** This is not a missing feature; it is an unconnected
seam between two models that both already exist and both already work.

### Why the assignment stage is worth noting separately

S4 passed on `caller_has_booking_engagement_for_project = true` while
`caller_manages_worker_by_roster = false`. The booking-engagement authority arm
is real, wired and correct. The engagement is trusted enough to assign a worker
to a project — but not to let that worker file the hours from it. That
asymmetry is the finding in one sentence.

## 5. Owner decision — two shapes, both viable

**This is not resolved here.** Both fixes are RED class under
`docs/PLATFORM_DOCTRINE.md` §4 (SECURITY DEFINER / `GRANT` / `ALTER POLICY`),
so neither may auto-merge, and prod apply is owner-channel only.

### Option A — the canonical route (doctrine-preferred)

On booking accept, also provision the canonical `engagement_contexts` row, with
a relationship slug from the **existing** registry (`freelancer`, `consultant`
or `collaborator` — no new slug needed).

- **For:** DOCTRINE §5.5 says every person↔organization relationship *is* an
  engagement-context row. This adds no second truth. It is exactly what pass 2
  proved, so it is already verified to close the loop.
- **Against:** `engagement_contexts` is read by **47 functions and 9 table
  policies**. The policy reach is the journal side — `journal_entries`,
  `journal_entry_confirmations`, `journal_entry_metrics`,
  `journal_entry_photos`, `journal_entry_skills`, `journal_entry_work_items`.
  That is arguably correct (the journal is the evidence spine for work done for
  that organization) but it **is** a visibility change and 25 of those
  functions do not discriminate on `relationship_slug`.
- **Reassurance, measured:** `manages_organization` requires
  `relationship_slug in ('manager','owner','external_manager')`, so a
  `freelancer` context grants **no** management authority. Confirmed in pass 2:
  `manages_organization = false` throughout.

### Option B — the narrow route (least privilege)

Add one named predicate, `has_booking_engagement_with_org_v1(org)`, and OR it
into exactly four call sites: `create_timesheet_v1`,
`start_workflow_instance_v1`, `workflow_can_view_version_v1`, and the
`workflow_definitions_select` policy.

- **For:** smallest possible blast radius. Grants nothing beyond filing and
  submitting one's own hours; every other surface is untouched.
- **Against:** it teaches four call sites that `company_worker_engagements` is
  a second person↔organization relationship — the parallel-structure risk
  DOCTRINE §5.5 exists to prevent. Each new operational surface would then have
  to remember the second arm, and the one that forgets is a silent hole.

### What was rejected outright

Widening `belongs_to_organization` itself. It is called by 7 functions and 6
policies, so this would also hand a booked worker `leave_balance_policies`,
`organization_roles`, `organizations`, `review_cycles` and `training_programs`
— an unrequested widening well outside G-01.

### Recommendation

**Option A**, scoped to a non-management slug, with the visibility delta stated
explicitly in the PR and a guard pinning that a booking-provisioned context can
never carry a management slug. It closes the loop for every surface at once
instead of four, it is the model the doctrine already names as canonical, and
pass 2 has already proven it works end to end against production behaviour.

Option B is the right choice **only** if the owner's answer to *"should a
booked worker's journal entries sit in the engaging organization's context?"*
is no. That question is a product and privacy decision, not an engineering one,
which is why it is left here rather than answered.

## 6. What this changes about the master audit

`docs/audits/labourmarket-master-audit-2026-09-01.md` records G-01 as
`IMPL / P1` — "no closed loop". That was right about the outcome and, on this
evidence, understated about the readiness:

- 10 of 11 stages already work in production, unchanged.
- The split-hours requirement, listed under §I as something that **"cannot be
  satisfied today"**, is satisfied today — it was blocked on nothing but rows.
- G-04 (timesheet submit/review/approve, "no E2E spec, no workflow instance
  ever created") is proven reachable: a workflow instance was created, approved
  and synced onto the document in pass 2.

The remaining work for G-01 is **one owner decision and one RED migration**,
not an implementation programme.

## 7. Reproduce

```bash
DATABASE_URL='postgresql://...' bash scripts/db-proof/g01-operational-loop.sh
```

The runner deliberately does **not** use `set -e`: the probe exits non-zero on
success (it raises P0001 to force its own rollback), so the completion sentinel
is emitted from an `EXIT` trap. A runner that appends a sentinel after a
command which may legitimately exit non-zero must never rely on fall-through
under `set -e` — otherwise any waiter watching the log hangs forever, and a
harness defect gets read as a product hang.

## 8. Residue

Verified after every run. All zero, and every production total identical to the
audit baseline:

```
probe_auth_users 0 · probe_profiles 0 · probe_organizations 0 · probe_companies 0
probe_customer_requests 0 · probe_projects 0 · probe_work_objects 0

booking_requests 0 · company_worker_engagements 0 · engagement_contexts 53
project_worker_assignments 2 · work_objects 0 · work_hour_allocations 0
timesheets 1 · workflow_definitions 16 · workflow_instances 0
demand_interest_signals 5
```

---

*Read-only against production by construction. LabourMarket.ai · 2026-09-01 ·
baseline `main = f3c227ea`.*
