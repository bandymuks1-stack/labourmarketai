# Candidate Pipeline Contract v1

Status: ACTIVE (canonical-user-journey-living-cv-crm v1)
Date: 2026-07-13

## The rule: ONE derived pipeline, never a 7th enum

The canonical candidate pipeline stage for a (demand, worker) pair is
DERIVED at read time from the existing real facts by
`apps/web/lib/pipeline/candidate-pipeline.ts`. It is never stored — that is
what keeps it canonical while `demand_shortlist`, `demand_interest_signals`,
`booking_requests` and the conversations model each keep recording exactly
the fact they own.

## The 7 human stages and their derivation (precedence top-down)

| Stage | LT | Derived from |
|---|---|---|
| accepted | Priimtas | booking_requests status `accepted` (beats everything) |
| offer | Pasiūlymas | booking_requests status `proposed` |
| rejected | Atmestas | shortlist `not_fit` OR booking `declined` |
| interview | Pokalbis | a real direct conversation exists between the pair — an active two-way exchange, honestly documented as NOT a scheduled meeting (no interview entity exists) |
| contacted | Susisiekta | interest signal `contacted` (set only when a real thread was opened — audit PR5 rule) |
| reviewing | Peržiūrimas | shortlist `saved`/`interested`/`reviewed` OR interest ack `reviewed` |
| new | Naujas | default-closed — candidate visible in scouting, no action yet |

Withdrawn/expired bookings and withdrawn interest fall through (they are
neither offers nor rejections). A worker-only `interested` signal stays
`new` for the pipeline (the company has not acted); the interest badge
still shows it separately.

## Per-stage guarantees

- Persisted status: every input fact IS persisted in its owning table; the
  stage is a pure function of them (unit-pinned ladder, 17 tests).
- One next action per stage (`nextActionForStage`) with a real route.
- History/audit: booking_request_events (bookings), append-only interest
  signal transitions, conversation messages — each fact's own audit trail.
- Permissions: every underlying fact is RLS-scoped to the demand owner /
  the worker; the derivation adds no new read surface.
- Context: the stage chip renders on the scouting candidate card next to
  the existing match/interest context — no separate pipeline page, no
  second candidate list.

## Known limitation (honest)

The conversation fact is pair-level (company user ↔ worker), not
demand-scoped — typed per-demand thread sources sit behind an owner-gated
RPC. A pair talking about demand A will show `interview` on demand B too.
Documented in the module; acceptable because a real conversation between
the pair IS the human meaning of the stage.

## Guards

`lib/guards/candidate-pipeline-canonical.test.ts` pins: the 7-stage set,
module purity (no DB client, no DDL), derivation-only (no migration stores
a stage), one next-action per stage with real hrefs, scouting wiring.
