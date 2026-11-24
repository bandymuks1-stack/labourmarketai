# W14 item 6 — `ai_runs` retention contract

Re-derived from `main @ e6827504`. Three facts change what this item is.

## 1. There is no production data to retain

`AI_PROVIDER_MODE` defaults to `disabled` (`lib/env.ts`), and **both** write
paths are gated on `cfg.state === "live"` (`lib/ai/run-agent-server.ts:40,51`).
The applied ledger records **INITIAL PRODUCTION ROWS = 0** at apply time
(`20260803061937`) and the provider has never been enabled since.

So `ai_runs` in production is **empty and cannot grow** while the provider is
disabled. Volume, growth and payload size are all zero — there is no backlog,
no cost pressure and no live PII sitting in the table today.

## 2. The retention period is already an owner decision — do not invent one

From `docs/APPLIED_LEDGER.md`, recorded with the apply approval:

> full `ai_runs` rows and `output_excerpt` must be retained **no longer than 90
> days**, and longer-horizon KPI history must come from **aggregated, minimised
> data** rather than indefinitely retained model output excerpts.
>
> **REQUIRED BLOCK BEFORE `AI_PROVIDER_MODE` ACTIVATION.**

No legal period is invented here and none is needed: 90 days is the owner's
stated figure, and the constraint is a **precondition on activation**, not an
urgent cleanup of existing data.

## 3. Retention-by-deletion is currently impossible by design

The table is append-only **at the grant level**, not merely by policy absence
(`20260714150000`, verified post-apply by `has_table_privilege`):

```sql
revoke insert, update, delete on public.ai_runs from authenticated;
grant  select, insert          on public.ai_runs to   service_role;
revoke update, delete          on public.ai_runs from service_role;
```

**No role can delete a row — including `service_role`.** A retention job cannot
be written today. This is not an oversight: append-only is the audit guarantee
the table exists to provide.

So "retention" here cannot mean "a cron that deletes old rows" without first
deciding how to reconcile deletion with the append-only guarantee. That is the
owner/product decision this item surfaces.

## The retention contract

| purpose | what must remain | how long | why |
|---|---|---|---|
| operational debugging | `task_type, tier, provider, model_alias, model_id, route_reason, latency_ms, fallback_*, blocked_reason, schema_validation` | 90 days | reproduce a routing decision while it is still actionable |
| **billing / cost evidence** | `estimated_cost_usd, actual_cost_usd, input_tokens, output_tokens, created_at` | **longer than 90 days, aggregated** | cost history must outlive the excerpts; the ledger explicitly requires aggregated, minimised data for the long horizon |
| analytics aggregates | daily counts by `task_type` / `tier` / outcome | indefinite, aggregated | KPI history without retaining any model output |
| **sensitive** | `output_excerpt` (≤4000 chars of validated model output), `profile_id`, `data_categories_sent` | **90 days maximum** | the only free-form content in the table, and the only per-user pointer |
| daily budget counter | today's rows only | 1 day | `countAiRunsTodayBestEffort` queries `created_at >= start of UTC day` — it needs nothing older |
| security / audit | append-only integrity | see decision below | deleting from an append-only audit log is itself an audit event |

Note the asymmetry that makes this non-trivial: the **budget counter needs one
day**, **debugging needs 90**, and **cost evidence needs longer than 90 but only
in aggregate**. A single "delete after 90 days" rule satisfies the first two and
destroys the third unless aggregation exists first.

## Sensitive-data findings

- `output_excerpt` — bounded to ≤4000 chars of the schema-**validated** output
  (the accepted subset), never raw input. Still the only free-form content.
- `data_categories_sent` — field **names** only, never values. Low risk.
- `profile_id` — nullable FK to `profiles`. The per-user link.
- **No input content is stored anywhere in the table**, by the migration's
  stated invariant.

## Dependencies

| consumer | depends on |
|---|---|
| `countAiRunsTodayBestEffort` | today's non-blocked rows only |
| `lib/admin/ai-cost.ts` | cost + token columns over a window |
| `lib/ai/runtime/audit-store.ts` | insert path only |
| foreign keys | one FK: `profile_id → profiles(id)` |

Nothing reads `output_excerpt` programmatically today — it exists for human
audit. That is convenient: an excerpt-only redaction breaks no consumer.

## OWNER / LEGAL DECISIONS REQUIRED

**D1 — how does a 90-day rule coexist with append-only?** Options, smallest
first:

- **D1a — redact, do not delete.** `UPDATE ai_runs SET output_excerpt = NULL`
  after 90 days. Preserves the row, the cost evidence and the audit chain;
  removes the only free-form content. Requires granting `UPDATE (output_excerpt)`
  to a retention role — a narrower hole than `DELETE`, and arguably still
  "append-only" for the audit fields.
- **D1b — delete the row.** Requires `DELETE` for a retention role and ends the
  append-only guarantee. Also destroys cost history unless aggregation lands
  first.
- **D1c — partition by month and drop old partitions.** Cleanest at volume,
  largest migration, and premature for an empty table.

**Recommendation: D1a**, paired with a cost-aggregation table before any row
deletion is considered. It satisfies the owner's stated rule (excerpts not
retained beyond 90 days; long-horizon history aggregated and minimised) with
the smallest possible weakening of the audit guarantee.

**D2 — how long may aggregated cost history live?** Not stated by the ledger.
Needs an owner answer before the aggregation table is designed.

## Safe work completed in this slice

Per §11, only non-destructive work: **this contract**, the classification of
every column by purpose, the dependency map, and the finding that the table is
empty and undeletable. **No retention migration is written**: it would need its
own human gate, and D1 is unanswered — writing SQL for an undecided policy would
be inventing the policy.

**Status: `ITEM_6_BLOCKED_ON_OWNER_DECISION` (D1, D2).** Nothing is urgent:
production rows = 0, and the constraint binds only at `AI_PROVIDER_MODE`
activation, which is separately gated.
