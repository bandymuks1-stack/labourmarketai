# W14 item 6 — `ai_runs` retention (owner decisions supplied, mechanism implemented)

> **CORRECTED 2026-08-19 — this retention migration IS applied.** Verified
> against production: `public.ai_runs_retention_days()` returns **90** and
> `ai_runs_retention_sweeps` holds **11** recorded sweeps. The status line below
> was accurate when written and is kept as the record of that moment.
>
> This matters beyond tidiness: the 90-day retention policy is the REQUIRED
> BLOCK that `docs/human-gates/ai-runs-cost-accounting-gate.md` places before
> `AI_PROVIDER_MODE` activation. Reading the line below as current would suggest
> activation is still blocked on it. It is not — that precondition is met.

*(Original status, superseded:)* `OWNER_APPROVAL_REQUIRED_BEFORE_APPLY`. Migration + rollback written, every
required property proven on a local stack. **Not applied to production.**

> Note: PR #1089 (W12 privacy, still owner-gated) carries an earlier
> *contract-only* draft of this document. This file supersedes it; drop that
> copy when whichever PR merges second is rebased.

## Facts that shape the item

1. **Production `ai_runs` = 0 rows.** `AI_PROVIDER_MODE` defaults `disabled`
   and both write paths are gated on `cfg.state === "live"`. Re-checked
   read-only; the local table is also 0 after fixtures were cleaned.
2. **The table is append-only at the GRANT level**, verified by
   `information_schema.role_table_grants`: `service_role` holds `INSERT,
   SELECT` and nothing else; `authenticated` holds `SELECT`. No role can
   `UPDATE` or `DELETE`.
3. Retention therefore could not mean "a cron that deletes rows" without
   reversing the guarantee the table exists to provide.

## Owner decisions (supplied 2026-08-08)

**D1 — REDACT-NOT-DELETE.** After 90 days, free-form AI content such as
`output_excerpt` must no longer be readable. Preserve only the minimum
structured audit/cost information. Do **not** delete the append-only audit
record merely to satisfy retention.

**D2 — aggregated AI cost history may be retained long-term** as business
cost/optimisation data, provided it holds no unnecessary free-form AI content
or personal data.

## Retention categories

| category | columns | after 90 days |
|---|---|---|
| **A. free-form AI content** | `output_excerpt` (≤4000 chars of validated model output) | **REDACTED → NULL** |
| B. operational metadata | `task_type, provider, model_alias, model_id, prompt_version, tier, route_reason, locale, input_source, schema_validation, confidence, latency_ms, fallback_*, escalation_applied, blocked_reason, human_review_state, request_context` | preserved |
| C. audit evidence | `id, created_at, data_categories_sent` (field NAMES only) | preserved |
| **D. cost / accounting** | `estimated_cost_usd, actual_cost_usd, input_tokens, output_tokens` | preserved (**D2**) |
| E. aggregated analytics | derived, not stored | n/a |
| F. personal / sensitive | `profile_id`, `output_excerpt` | `output_excerpt` redacted; **`profile_id` NOT touched** |

**`output_excerpt` is the only column carrying model output.** Every other text
column is a bounded value written by our own routing code — `route_reason` ≤600,
`input_source` ≤120, `confidence` ≤16, `fallback_reason` ≤120, `blocked_reason`
≤64, `request_context` ≤120, `schema_validation ∈ {passed,failed,skipped}`, and
`data_categories_sent` holds field NAMES, never values.

**`profile_id` is deliberately left alone.** It is structured, not free-form,
and removing it is a separate decision nobody has taken. The owner decision is
not broadened beyond what it names.

## The mechanism — why a function, not a GRANT

Granting `UPDATE (output_excerpt)` to `service_role` would hand **every**
ordinary application path a mutation capability over historical audit rows, for
the sake of one scheduled job.

Instead the capability lives in ONE `SECURITY DEFINER` function that expresses
the whole rule — one column, one predicate, one threshold — and `service_role`
receives `EXECUTE` on that while still holding **no table-level UPDATE or
DELETE**.

Net property, which is exactly what was asked for:

- ordinary application/service paths **cannot** mutate historical `ai_runs`;
- a narrowly constrained retention mechanism **can** redact only the approved
  field, only past the threshold, without rewriting any other audit fact.

The horizon may be **lengthened** by a caller but **never shortened** below the
approved 90 days — a retention job is not a place to quietly destroy more
history than the decision allows.

## Proof (local stack; no fake production rows were created)

| property | result |
|---|---|
| record at 10 days → excerpt preserved | ✅ |
| record at **89** days → excerpt preserved (boundary) | ✅ |
| record at 120 days → **excerpt NULL** | ✅ |
| audit identity (`task_type`/`provider`/`model_alias`) preserved on the redacted row | ✅ |
| cost + tokens preserved on the redacted row (`0.22`, `300/400`) | ✅ |
| re-run redacts **0** — idempotent | ✅ |
| `service_role` direct UPDATE of `output_excerpt` | **permission denied** ✅ |
| `service_role` direct UPDATE of a cost field | **permission denied** ✅ |
| `service_role` DELETE of an audit row | **permission denied** ✅ |
| `authenticated` calling the function | **permission denied** ✅ |
| `anon` calling the function | **permission denied** ✅ |
| shortening the horizon to 10 days | **refused** (`22023`) ✅ |
| lengthening to 365 days | allowed, redacts 0 ✅ |

## Ships unapplied and inert

Nothing calls the function: no scheduler entry, no application code path, and
production holds 0 rows. **Applying the migration grants a capability, not an
action.** Wiring a scheduled caller belongs with `AI_PROVIDER_MODE` activation,
which is separately gated — and this retention mechanism is precisely the
REQUIRED BLOCK that the applied ledger records against that activation.

## Files

- `supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql`
- `supabase/rollbacks/20260808130000_ai_runs_retention_redaction_v1.down.sql`

**Rollback's honest limit:** dropping the function removes the capability; rows
already redacted stay redacted. A rollback cannot resurrect content that was
deliberately destroyed, and claiming otherwise would be the dishonest part of
an "undo".

## Remaining

**No legal retention period was invented.** 90 days is the owner's figure,
already recorded in `docs/APPLIED_LEDGER.md` against the `ai_runs` apply.
D2's long-term aggregate store is **not built here** — no aggregation table
exists yet, and none is needed until the provider is live and rows accumulate.
