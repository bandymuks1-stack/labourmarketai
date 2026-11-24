# G-04 — timesheet submit → review → approve, proven independently

**Date:** 2026-09-01
**Baseline:** `main = f07a6a94 = production` · tree clean · CI green
**Database:** production (`gorgitwvdzxbnaxhrsrw`), probed inside a transaction
that rolls itself back. **Zero rows were added to production.**
**Status of this document:** finding. **No fix was needed and none was applied.**

---

## 1. What was asked

The master audit records G-04 as `VERIF / P1`: *"no E2E spec for
submit/review/approve; no workflow instance ever created"*. The instruction was
to prove **submit → review → approve without crossing the G-01 owner gate**.

That constraint is the whole point. G-01 closed this same chain, but only in its
**pass 2** — by adding the very `engagement_contexts` row that **is** the open
owner decision. That left G-04 looking dependent on a decision it does not
actually need.

## 2. Why it is independent

`belongs_to_organization(org)` recognises **two** relationships:

```sql
engagement_contexts (profile, org, status='active')   -- the disputed booking bridge
company_memberships (profile, org, status='active')   -- an ordinary org member
```

G-01's open question is only about the **first**. This probe uses **only the
second**: the worker is a plain `member` of the organization — the lowest role
in the closed vocabulary (`owner | admin | manager | external_manager | member`)
— created by the normal membership path.

The probe **asserts** the absence rather than assuming it, at both ends of the
run: zero `engagement_contexts` rows **for the organization under test**, and
exactly one active `company_memberships` row. With the other arm empty, a true
`belongs_to_organization` can only have come from membership.

## 3. Result — 13 of 13 stages pass

| Stage | Result |
|---|---|
| S0 seed — member relationship only | ✅ 0 org-scoped contexts |
| S0b gates (worker / outsider) | ✅ belongs=true, manages=false / outsider false, false |
| S1 approval template installed | ✅ `installed` |
| S1b worker reads template (web path, under RLS) | ✅ 1 definition, 1 published version |
| S2 two work objects | ✅ `created` / `created` |
| S3 split hours | ✅ 2 rows, **10.00 h** |
| S4 timesheet | ✅ 2 lines, **10.00 h** derived |
| S5 workflow instance + submit | ✅ instance created, `submitted` |
| **S6 separation of duties** | ✅ **all three refused** |
| S7 review + approve | ✅ `approved` |
| S8 decision lands on document | ✅ timesheet `approved`, 1 event |
| S9 approved document frozen | ✅ `not_editable` |
| S10 G-01 gate never crossed | ✅ 0 org contexts, 1 membership |

**The split-hours requirement is satisfied:**

```
G04 Object 01   8.00 h   2026-09-01   source=manual
G04 Object 05   2.00 h   2026-09-01   source=manual
               ───────
               10.00 h   across 2 canonical rows

timesheet lines_snapshot: 2 lines, 10.00 h derived
source: "work_hour_allocations+journal_entry_metrics"
```

Totals are **derived** exactly as the app derives them
(`deriveTimesheetTotals`, `lib/timesheets/timesheets-model.ts`) — summing
`value` over `unit = 'hours'` — rather than reading keys the snapshot does not
contain and calling a null a pass.

### Separation of duties — the part nobody had measured

The default pack's approver rule is
`{"kind":"org_role","roles":["owner","admin"]}`, so a `member` is not an
approver. Three refusals were probed, and in each case the instance was re-read
afterwards to confirm the refusal was real rather than cosmetic:

```
requester approving their own timesheet   -> not_found   (instance still pending)
outsider approving it                     -> not_found   (instance still pending)
outsider merely VIEWING it                -> timesheet_can_view_v1 = false
then the org owner approving it           -> approved
```

`not_found` rather than `forbidden` is the right answer: it is the same reply a
non-existent instance would give, so neither actor learns that the timesheet
exists. And after approval the document is **frozen** — a resubmit by its own
author is refused `not_editable` with the status verified still `approved`.

## 4. Classification change

G-04 was `VERIF / P1` — a **verification** gap, and it turns out that was
exactly right: **nothing was missing and nothing needed fixing.** The chain,
the workflow engine, the approver resolution, the separation of duties and the
freeze all already work in production.

**G-04 is closed as PROVEN.** It is not blocked by the G-01 owner decision and
never was.

What G-01 owns is narrower than the master audit implied: not "the approval
layer", but specifically **whether a worker who reached the organization
through booking counts as being of that organization**. Workers who are org
members already file, submit and get their hours approved today.

## 5. A defect this probe found in itself

The first run asserted `engagement_contexts` for the worker `= 0` **unscoped**,
and reported `1`. The row was not seeded by the probe — it is created by
`ensure_worker_personal_engagement`, an `AFTER INSERT ON workers` trigger that
gives **every** worker one context with slug `employee` and
**`organization_id` NULL**: a personal context attached to no organization.

`belongs_to_organization(org)` matches on `ec.organization_id = org`, and NULL
never equals an org, so that row cannot satisfy the gate. The assertion was
over-broad; the product was correct. It was re-scoped to the organization under
test, and **both** counts are now reported so the claim can be checked instead
of taken on trust.

Recorded because the failure mode is instructive in the opposite direction from
the usual one: an assertion can be *too strong* and produce a false alarm just
as easily as it can be vacuous and produce a false pass. Neither is fixed by
adjusting the number until it goes green — both are fixed by finding out why.

## 6. Reproduce

```bash
DATABASE_URL='postgresql://...' bash scripts/db-proof/g04-timesheet-approval.sh
```

The runner deliberately does **not** use `set -e`: the probe exits non-zero on
success (it raises P0001 to force its own rollback), so the completion sentinel
is emitted from an `EXIT` trap.

## 7. Residue

Verified after the run. All zero, and every production total identical to the
audit baseline:

```
probe_auth_users 0 · probe_profiles 0 · probe_companies 0
probe_organizations 0 · probe_projects 0 · probe_work_objects 0

timesheets 1 · workflow_instances 0 · workflow_definitions 16
work_hour_allocations 0 · work_objects 0 · engagement_contexts 53
```

Note `workflow_instances` is back to **0**: the first workflow instance this
platform has ever created was created by this probe, and rolled back.

---

*Read-only against production by construction. LabourMarket.ai · 2026-09-01 ·
baseline `main = f07a6a94`.*
