# Labour Market Intelligence — honest status v1

What the intelligence layer can truthfully do **today**, what it honestly
cannot, what is owner-gated, and what is merely planned. Doctrine §18: no
demo layer, no fabricated capability — a state not listed under COMPUTED is
not computed.

Architecture: `docs/intelligence/labour-market-intelligence-layer-v1.md`
Runbook: `docs/intelligence/activation-runbook-v1.md`

## COMPUTED now (deterministic, from canonical data)

- **Internal salary aggregates** — declared-salary aggregates (midpoints,
  monthly EUR) when the cohort meets the threshold (n ≥ 3 stored, n ≥ 5 shown
  exactly; 3 ≤ n < 5 shown as a small-sample band). Below threshold:
  `insufficient_data`, never an extrapolated number.
- **Admin benchmark comparison** — comparison against admin-entered, sourced
  `market_rate_averages` rows (the existing thermometer component), with
  source note and basis carried through.
- **Supply/demand counts + calculated gaps** — per skill/profession per
  geography per window, demand from canonical `customer_requests`/company
  demand minus supply from `worker_skills`/confirmations, every term
  traceable via `derivation_ids`, always labelled `calculated_gap`.
- **Missing-skills-per-recommendation passthrough** — reuses match-v1
  `FitBasis.missingUris`; the intelligence layer aggregates the existing
  per-context fit basis, it does not invent a new fit metric.
- **Capacity / gap reuse** — available-capacity figures reuse the existing
  workforce-planning models, labelled `available_capacity`.

## UNAVAILABLE (honest states shown instead)

- **Expected time-to-fill** — the platform has no measured fill-time data;
  the surface says so (`no_measured_data`), it does not estimate.
- **Net ↔ gross salary comparison** — no tax model exists; basis mismatch
  returns `not_comparable`, never a converted guess.
- **Emerging skills without two windows** — one observation window cannot
  show a trend; the state is `insufficient_history` until two complete
  windows exist.

## GATED (owner action required)

- **The three intelligence tables** — migration
  `20260714230000_market_intelligence_observations_v1` is DRAFT / not
  applied. Until the owner applies it (runbook Step 0), every intelligence
  surface shows its `needs-migration` state.
- **Every external source** — `stat_gov_lt`, `eurostat`, `cvbankas_salary`
  all ship `legal_status='unconfirmed'`, `activation='off'`. Nothing external
  is fetched, imported or displayed until the owner completes the per-source
  checklist (legal/terms, robots, rate limits, attribution, owner SQL +
  code-side dual gate). CVbankas is proposed-only and must never be labelled
  as a LabourMarket.ai average.
## PLANNED (not shipped, not promised in UI)

- **AI summaries of computed insights** — NOT implemented in this slice.
  Registering an `intelligence_summary` agent in the AI Provider Router is
  deliberately guard-pinned work: `lib/guards/prompt-registry-required.test.ts`
  and `lib/ai/runtime/task-routing.test.ts` both pin the registered-agent
  count at 11, so a follow-up slice must bump both pins consciously. Until
  then insight cards are deterministic-only (which is the authoritative mode
  anyway — AI text would only ever be labelled summarization, never numeric
  truth).

- Background refresh jobs with freshness SLAs (none installed — no scheduler
  before proven value; recompute is manual + idempotent).
- Licensed-partner sources (`source_kind='licensed_partner'` exists in the
  contract; no partner is registered).
- Export endpoint for `public_aggregate` observations.
