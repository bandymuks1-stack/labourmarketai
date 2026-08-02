# Human gate — apply `ai_runs` so AI cost stops being unattributable

**Status:** OPEN — awaiting owner decision. Nothing in this repo applies it.
**Migration:** `supabase/migrations/20260714150000_ai_runs_audit_v1.sql`
**Rollback:** `supabase/rollbacks/20260714150000_ai_runs_audit_v1.down.sql`
**Raised by:** W14 audit P0-2, closed on the code side by W14 Slice 2.

---

## What the audit said, and what is actually true

The W14 audit classified P0-2 as *"AI usage and cost are computed and thrown
away — DEAD"*. Re-verified against the tree, the mechanism is **not** what the
finding describes. The code side is complete:

| Step | Where | State |
|---|---|---|
| Tokens captured | `lib/ai/runtime/providers/anthropic.ts` (+3 siblings) | works |
| USD computed from real usage | `lib/ai/runtime/model-pricing.ts`, `lib/ai/run-agent.ts` | works |
| Attributed (model, alias, tier, task, operation, profile, tokens, latency) | `buildAiRunRow` | works |
| Insert attempted | `lib/ai/runtime/audit-store.ts` | works |
| Wired into the canonical entrypoint | `runAiAgent` → used by 5 feature modules | works |
| **Row lands in production** | `ai_runs` table | **MISSING — this gate** |

So nothing needs to be built. One table needs to exist.

W14 Slice 2 fixed the one part that did not need this gate: `run-agent-server.ts`
awaited `persistAiRunAudit` and **discarded its boolean**, so a run whose cost
was never recorded was indistinguishable from one that was. It now warns under
the stable marker `[ai/cost]`, saying whether real money went unattributed.

## What applying it buys

Four of the 39 tracked KPIs are **permanently uncomputable** until this lands:
`cost_ai`, `top_cost_features`, `top_ai_consumers`, `acpu`.

Also: `AI_DAILY_RUN_BUDGET` counts today's rows to enforce itself. With no
table the count is unavailable, so **the daily budget cap does not bind**. That
is the operationally sharp one — it is a spend control that currently cannot
fire.

## Risk assessment

**Low.** One new table, zero changes to existing objects.

- Append-only log. `UPDATE`/`DELETE` revoked for **every** role including
  `service_role` — append-only at the grant level, not by convention.
- RLS: admin-only `SELECT` via `is_admin()`. **No anon access. No authenticated
  write path.** Writes are service-role only.
- Stores field **names** (`data_categories_sent`), never values, plus a bounded
  ≤4000-char excerpt of the schema-**validated** output. Input content never
  reaches the module.
- No existing table, policy, function or grant is touched.
- No backfill. The log starts empty and grows only from live runs.

## Blast radius if it goes wrong

Effectively nil for users: persistence is best-effort and never throws, so even
a broken table cannot affect a run's outcome. Rollback is a paired down
migration that drops one table nothing reads.

## Precondition worth knowing

Production currently runs `AI_PROVIDER_MODE=disabled`. Applying this migration
therefore changes nothing observable **until** AI is switched on — it makes the
table ready, it does not start any spend. That makes it a safe thing to apply
*before* enabling AI, and a bad thing to forget *after*.

## What the owner is being asked to decide

Apply `20260714150000_ai_runs_audit_v1.sql` to production — yes or no.

If **yes**, the follow-up in the same session:

1. apply the migration;
2. record it in `docs/APPLIED_LEDGER.md` (it is currently listed under the
   deferred/human-gated section);
3. verify: RLS on, admin-only SELECT present, no anon grant, `UPDATE`/`DELETE`
   revoked for every role;
4. re-run `lib/guards/ai-cost-accounting.test.ts` — its last block asserts the
   ledger still says `HUMAN GATE`, so that assertion is the deliberate tripwire
   telling you to revisit this document in the PR that applies it.

If **no**, nothing changes and the `[ai/cost]` warning stays the honest signal
that cost attribution is off.

## What this gate is NOT

- Not billing. No charge, no credit decrement, no plan limit, no Stripe, no
  user-visible amount. `ai_runs` is an internal cost-attribution log.
- Not a data migration. No existing rows are read, written or moved.
- Not a prerequisite for any user-facing feature.
