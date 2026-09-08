# Train F4 — company work chain, production proof on existing features (2026-09-02)

Bounded company `E2E Walker UAB` (organization `a996113c…`), manager = walker identity, worker = `e2e-worker2-…`.
Headless Chromium, sessions injected (API login), workspace pointer cookie for the manager. Everything below ran
through the REAL UI and the real RPCs; nothing was written by SQL. The PLAN primitive (Train F1, RED draft #1426)
is excluded — it is owner-gated.

| # | Step | Actor | Surface / RPC | Result |
|---|---|---|---|---|
| 1 | invite to roster | manager | `invite_company_worker` | `invited` |
| 2 | accept | worker | `accept_company_worker_invitation` (own session) | `linked` — `company_workers` row |
| 3 | operations role | manager | `assign_company_worker_role(worker)` | `assigned` |
| 4 | organisation binding | manager | `add_org_member(org, worker)` | `added` — the step that makes the org appear in the worker's timesheet organisation options (see finding F4-1) |
| 5 | work object | manager | `create_work_object_v1` → `Objektas A` | `created` |
| 6 | actual hours | manager | XLSX import (Train E3) | 5 `work_hour_allocations`, 38 h |
| 7 | approval pack | manager | `/dashboard/planning` → "install timesheet approval templates" | "Standartiniai tvirtinimo šablonai įdiegti — žiniaraščių tvirtinimo šablonas paskelbtas" |
| 8 | timesheet | worker | `/dashboard/planning` → create (org, 2026-09-01 … 09-30) | draft `a4e08c16…` (JUODRAŠTIS) |
| 9 | compute | worker | "Atnaujinti" | 5 lines derived from `work_hour_allocation` (8/8/6/8/8 h, object `Objektas A`) |
| 10 | submit | worker | "Pateikti" | PATEIKTAS; workflow instance `deba4c4b…` step 1 "Manager approval", approver = the manager |
| 11 | approve | manager | `/dashboard/network?area=approvals` → inbox item → "Patvirtinti" | `approvals-notice-approved` |
| 12 | sync + status | worker | "Sinchronizuoti" | **PATVIRTINTAS** (approved) |
| 13 | export | worker | `GET /dashboard/planning/timesheets/<id>/export` | 200 `text/csv`, 7 data lines: `period_start, period_end, status=approved, day, title=Objektas A, …, hours, derived_from=work_hour_allocation` |

Screenshots: `f4-timesheet-worker-1440.png`, `f4-approvals-inbox-1440.png`, `f4-timesheet-final-1440.png`.

Verdict: **PRODUCTION_PROVEN** — people → roster → object → actual hours (imported) → timesheet → manager approval →
approved history → report/export. Still open in Train F: the PLAN primitive (gated), project/object/task/stage
linkage of the same hours, capacity respecting approved leave (M13), and a real company's own data.

## Finding F4-1 (product, Train F/G-01 class) — roster accept does not bind the organisation

`accept_company_worker_invitation` links `company_workers` only; the worker's `engagement_contexts` row stays
`employee` with `organization_id = null`, so the worker's timesheet organisation options are EMPTY until a
manager also calls `add_org_member` (membership) — `provision_company_worker_engagement_context` refuses plain
workers (`role_not_allowed`: it is the admin bridge). In the UI this reads as "I accepted the invitation but I
cannot create a timesheet for my company". Same class as the G-01 `belongs_to_organization` break already in
the register. Recommended fix (additive): accepting a company-worker invitation should also create the
organisation membership (or the org-bound engagement) for the roster worker — one RPC change, RED by rule.
Recorded in the register; not fixed here.

## UI notes for Train I
- The approvals inbox is reachable only with `?area=approvals` (the timesheet card's "Open approvals" link uses
  `#approvals`, which lands on the default network area) — link/anchor mismatch, P2.
- "Rodyti eigą" (workflow timeline) and the reason field render inside the inbox item; the layout is consistent
  with the rest of the shell.

Residue (gate G-9): timesheet `a4e08c16…`, workflow instance `deba4c4b…`, roster/membership rows, allocations —
all inside the bounded company; TEST, never metrics.
