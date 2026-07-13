# Future Work Planning Contract v1

Status: ACTIVE (Labour Market OS P1 — workforce planning)
Date: 2026-07-13

## The rule: canonical intake, never a 4th demand model

A "future work entry" is a READ-TIME projection composed by
`apps/web/lib/workforce/future-work-model.ts` from the TWO models that
already exist:

| Source | Record | What it contributes |
|---|---|---|
| demand | `customer_requests` row, kind `company_request`, with `payload.structured_v2` (structured demand contract v2) | dates (`time.start_earliest` / `time.end_date`), country (`contract_country`), hours/shifts, team shape (`target_supply`), certificates, languages, experience, partner expectation |
| project | `projects` row (draft/live/paused) | title, country, city, start/end date band — the delivery axis |

Employer intake happens ONLY through the existing demand form
(`save_demand_draft` / `submit_demand_request` RPCs on `customer_requests`)
and the existing project form. The workforce layer adds NO new intake
surface, NO new table, NO migration — the guard
(`lib/guards/workforce-canonical.test.ts`) pins a closed table allowlist
and scans migrations for a workforce store.

Composition (`composeFutureWork`) is deduplicated by `${source}:${sourceId}`
and timeline-ordered (start date ascending, undated last). A demand and a
project are never merged into one entry: no stored demand→project link
exists, and inventing one would fake a relation.

## Entry-point freedom (owner correction, 2026-07-13)

Future-work planning is one of MANY valid entry points — not a mandated
first step (constitution §1.1). A company may equally start from a position,
a candidate, a client, an import, or free text; whichever path is taken,
data normalizes into the SAME canonical rows above (`customer_requests`,
`projects`) and their satellites — never into a duplicate object, and never
requiring re-entry of data another path already captured. The planning zone
presents derived needs and recommendations as labeled suggestions; it never
blocks or sequences the user's legitimate alternative actions. "Work first"
means only that the system CAN derive workforce needs from real future work.

## WorkforcePlanV1 — human-editable plan state on the canonical payload

The human-reviewed workforce plan is ADDITIVE JSON on the canonical demand
payload:

```
customer_requests.payload.workforce_plan   ← WorkforcePlanV1
customer_requests.payload.structured_v2    ← untouched (strict v2 contract)
```

- `WorkforcePlanV1 = { version: 1, requirements: WorkforceRequirement[],
  confirmedAtIso?, confirmedBy? }` — full type in `future-work-model.ts`.
- Written through the EXISTING owner-scoped `save_demand_draft` RPC
  (payload is jsonb) — no schema change needed.
- `writeWorkforcePlanV1` returns a NEW payload object, preserves every
  other key byte-for-byte and rejects invalid plans (never overwrites a
  stored plan with garbage). `readWorkforcePlanV1` returns an honest null
  for absent/unknown/corrupt shapes.

### Why the plan is a SIBLING of structured_v2, not inside it

The program spec suggested `structured_v2.workforce_plan`, but
`structuredDemandV2Schema` is zod-STRICT: any unknown key inside
`structured_v2` makes every existing `readStructuredDemandV2` call return
null — silently breaking structured demand (honesty flags, worker-board
projection) for exactly the requests that have a workforce plan. Storing at
the payload root keeps the same canonical record, the same write RPC and
the same additive-JSON property without touching the frozen v2 schema.
Guard-pinned (`the plan is documented as ADDITIVE payload JSON…`).

## Server read composition

`apps/web/lib/workforce/workforce.ts` (`getWorkforce()`) composes the
RLS-scoped reads in the exact honest-degradation style of
`lib/planning/planning.ts` / `lib/tasks/tasks.ts`: per-source states
(`ok | needs-migration | managers-only | error`), bounded reads, no admin
client, read-only. Draft-migration sources degrade honestly:
`worker_languages` (20260711250000) and team brigades (20260705220000)
report `needs-migration` until the owner applies them.

## Guards

`lib/guards/workforce-canonical.test.ts` pins: module inventory, purity of
the four pure modules, server-only first line on the service, closed table
allowlist, no DDL/writes/RPC calls, no workforce migration, no
auto-confirm, and the create_position confirmed-gap gate.
