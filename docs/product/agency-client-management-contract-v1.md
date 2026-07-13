# Agency Client Management Contract v1

Status: ACTIVE (works-today slice) + OWNER-GATED (client records migration)
Date: 2026-07-13

## Owner decision (Direction A, re-confirmed 2026-07-13)

An agency is a company with `companies.company_type = 'staffing_agency'`
inside the SAME canonical company workspace (`/dashboard/company`). No
separate agency dashboard, no third identity, no parallel CRM, no separate
candidate model — ever.

## The agency working path

```
client → contact → need → position → candidates → status → communication
       → next action → hiring result
```

- **Client** — `agency_clients` row (owner-gated draft migration
  20260713160000; see below). Until applied: the panel shows the honest
  "prepared, owner activation pending" state.
- **Need/position** — the SAME canonical `customer_requests` flow every
  company uses (draft → wizard prefill → submitted; agency intent writes
  `kind='agency_offer'`). Per-client linkage = ONE additive column
  `customer_requests.agency_client_id` (in the same gated migration);
  until applied demands render truthfully as "not yet linkable".
- **Candidates/status** — the canonical derived pipeline on the scouting
  page (candidate-pipeline-contract-v1). No agency-specific candidate list.
- **Communication** — the same gated conversations model.
- **Hiring result** — booking accepted (pipeline stage `accepted`).

## Why a migration was needed (reuse honestly rejected)

`customers` (0026) cannot hold agency clients: `unique (profile_id)` allows
at most ONE row per profile; ownership is inverted (`owns_customer()` means
the row IS the caller — a buyer identity, not a record the caller manages);
INSERT RLS is admin-only and the only write paths are self-upserts that
depend on the unique constraint. `customer_requests.customer_id` is written
exactly once (self-resolved in `save_customer_request`) and no RPC accepts
a client id. `project_clients` is project-scoped and itself an unapplied
draft. Full record inside the migration header.

## Owner gate

`supabase/migrations/20260713160000_agency_clients_v1.sql` — DRAFT,
needs-human-gate, NOT applied by any agent. Additive only: `agency_clients`
(owned by the agency's canonical `companies` row, fail-closed RLS,
RPC-only writes: `save_agency_client_v1` / `remove_agency_client_v1` /
`set_demand_agency_client_v1`) + `customer_requests.agency_client_id`
(FK, ON DELETE SET NULL). Paired rollback; APPLIED_LEDGER.md Deferred
entry. Apply only after explicit owner OK via Supabase MCP.

## Guards

`lib/guards/agency-client-management.test.ts` — staffing_agency-only
render, shared primitives (no parallel client/demand model), no
auto-communication. `lib/guards/agency-direction-a.test.ts` — legacy
lib/agency pool world stays banned; the clients module is the allowlisted
exception.
