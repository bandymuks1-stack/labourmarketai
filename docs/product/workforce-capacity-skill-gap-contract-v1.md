# Workforce Capacity & Skill Gap Contract v1

Status: ACTIVE (Labour Market OS P3+P4 — capacity, gap timeline, recommendations)
Date: 2026-07-13

## Inputs (opaque ids only — privacy-pinned)

`apps/web/lib/workforce/capacity-model.ts` compares requirement lines
against the REAL internal supply:

- `WorkerCapacityInput`: workers.id (opaque), availability_status,
  available_from, planned commitments (assignment/booking date ranges),
  skills (worker_skills slugs + CONFIRMED profile_skill_claims labels),
  professions, certificates (worker_documents type slugs), languages
  (worker_languages — draft migration, degrades honestly), location
  country, availability preferences (willing_to_relocate, has_transport,
  max_trip_days, team/solo_available), brigade memberships, confirmed
  work-history count.
- NO name, email, phone or contact field may cross this boundary —
  pinned by a compile-time type test AND a runtime key-walk test in
  `capacity-model.test.ts`.

## Matching rules (deterministic, documented)

| Check | Rule |
|---|---|
| available | `availability_status !== "unavailable"` AND `available_from <= need start` (when both known) |
| free | no commitment overlaps the need window — INCLUSIVE calendar-day ranges, the exact booking-accept-guard semantics (`rangesOverlapInclusive`); no window → degrades to availability only |
| fit | profession matches the requirement, OR the worker covers >= half (rounded up) of the requirement's skills |
| eligible | available AND free AND fit — counts toward headcount |
| busy-fit | fit + available but committed in the window — transfer candidates, never counted as capacity |
| near-miss | partial skill coverage under the fit bar — training candidates |

Unknown data never matches (an unknown location is not a location match).

## The 8 gap types (per requirement, each with matchedWorkerIds + shortfall)

| Gap | required | matched |
|---|---|---|
| headcount | requirement.headcount | eligible workers |
| hours | requirement.totalHours | proportional: `requiredHours × min(eligible, headcount) / headcount` — documented approximation; no per-worker hour ledger exists; null when no hour volume was derivable |
| skill (per slug) | headcount | eligible workers holding the slug |
| certificate (per label) | headcount | eligible workers with a normalized-matching certificate (equality/containment — bounded free text, no taxonomy yet) |
| language (per lang) | 1 when `one_per_team_sufficient`, else headcount | eligible workers at the required CEFR level or above (`native` beats all) |
| supervisor | supervisor-line headcount | available+free workers with a coordinating profession (foreman/site_manager) or supervision skills |
| location | headcount | eligible workers in the entry's country or `willing_to_relocate = true` (axis absent when the entry states no country) |
| brigade | headcount | eligible members of the BEST existing brigade (brigade-shaped requirements only) |

Rejected requirement lines are excluded from assessment; every other
line — including unconfirmed suggestions — is assessed, and its human
status travels with the result for the recommendation gate.

## Gap timeline (`gap-timeline.ts`)

- Week (Monday-anchored) or month buckets covering every dated need band;
  bounded at 104 buckets. Per bucket: entries, required/matched headcount,
  shortfall, missing skills, risk level.
- **riskDate** = the first day capacity is insufficient: the later of the
  first shortfall bucket's start and the earliest need start among the
  short requirements in that bucket (a need cannot be at risk before it
  begins). Null when capacity always suffices.
- **Risk thresholds** (documented constants): `ok` = shortfall 0;
  `critical` = shortfall ratio > `CRITICAL_SHORTFALL_RATIO` (0.2) OR any
  supervisor/certificate shortfall in the bucket (one missing supervisor or
  mandatory certificate can stop a site); `tight` = any other non-zero
  shortfall.
- Undated needs are reported honestly in `undatedEntryIds`, never placed on
  the timeline.

## Recommendation catalogue (closed, realistic set)

| Action | Trigger (evidence gap required) |
|---|---|
| assign_existing_worker | eligible capacity exists for the requirement |
| transfer_from_project | shortfall while fitting workers are committed elsewhere in the window |
| form_brigade | brigade-shaped need where the best brigade covers only part |
| train_existing_worker | skill shortfall with near-miss workers (partial coverage) |
| create_position | **HARD RULE: only when a HUMAN-CONFIRMED requirement (`status === "confirmed"`) still has a headcount shortfall.** Enforced in code (the gate in `recommendForRequirement`), unit-tested (suggested/edited never produce it), and guard-pinned (source regex). |
| engage_staffing_agency | shortfall >= 5 heads or >= half the requirement |
| engage_partner | the demand itself expects an external partner (company supply / subcontract) |

Every action carries `reason` + `evidence { gapKind, shortfall, workerIds }`
— nothing is recommended without an evidencing gap. No outreach, hiring or
messaging is ever executed by this layer; these are internal suggestions.

## Guards + tests

- `lib/workforce/capacity-model.test.ts` — every gap type, inclusive
  overlap edges, honest nulls, no-PII (type-level + runtime).
- `lib/workforce/gap-timeline.test.ts` — bucketing, riskDate correctness,
  documented thresholds, every action trigger, the create_position gate.
- `lib/guards/workforce-canonical.test.ts` — the gate exists in source,
  the action set stays closed, module purity.
