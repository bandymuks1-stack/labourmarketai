/**
 * Agent runner — SERVER wrapper (Internal LLM Agents v1, PR3 · AI Router v1).
 *
 * Resolves env runtime config + the registered prompt and runs the agent.
 * Server-only (must never be imported by a client component — enforced by
 * no-direct-llm-client-call).
 *
 * AI Router v1 additions (server boundary ONLY — the core stays pure):
 *   - QUOTA: on live runs, when the caller did not supply `runsToday`, the
 *     persisted ai_runs counter is queried best-effort and fed into the
 *     daily-run-budget guard (over budget → honest `budget_exceeded` block).
 *     A failed count proceeds and logs — never a silent skip of a real count.
 *   - AUDIT PERSISTENCE: the routing audit record of every run that really
 *     happened is appended best-effort to the ai_runs table
 *     (runtime/audit-store.ts) — both the runs a vendor answered and the
 *     VENDORLESS ones (runtime disabled, deterministic tier, pre-dispatch
 *     block), which are the zero-cost resolutions the cost doctrine wants
 *     counted first. MOCK runs are never persisted: their output is fabricated,
 *     and a synthetic row produces a confident wrong number at month end.
 *     Persistence failures never affect the run outcome.
 *   - COST LEDGER: `usage_cost_events` stays VENDOR-ONLY. It records money,
 *     and a route that engaged no vendor has none to record.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { getAiRuntimeConfig, getAiProviderStates } from "./runtime/config";
import {
  auditDispositionFor,
  countAiRunsTodayBestEffort,
  persistAiRunAudit,
} from "./runtime/audit-store";
import { persistUsageCostEvent } from "@/lib/usage/usage-cost-store";
import { resolveAnalyticsAttribution } from "@/lib/telemetry/analytics-attribution";
import { getPromptEntry } from "./registry/registry";
import { runAiAgentCore, type AiAgentOutcome, type RunAgentOptions } from "./run-agent";
import type { AiAgentKey } from "./registry/types";

export async function runAiAgent<T = unknown>(
  agent: AiAgentKey,
  input: unknown,
  opts: RunAgentOptions,
): Promise<AiAgentOutcome<T>> {
  const entry = getPromptEntry(agent);
  const cfg = getAiRuntimeConfig();

  // Persisted daily-run counter (live runs only; best-effort — see docblock).
  let runsToday = opts.runsToday;
  if (runsToday === undefined && cfg.state === "live") {
    const counted = await countAiRunsTodayBestEffort();
    if (counted !== null) runsToday = counted;
  }

  // The server boundary is the only place that can observe what the operator
  // configured, so it is the only place that can hand the core a chain. Callers
  // that pass their own states (tests, evals) keep them.
  const outcome = await runAiAgentCore<T>(entry, input, cfg, {
    ...opts,
    runsToday,
    providerStates: opts.providerStates ?? getAiProviderStates(),
  });

  // Append-only audit trail for REAL runs — never blocks the outcome.
  //
  // "Real" used to mean `cfg.state === "live"`, i.e. "a vendor answered", and
  // every other finished route was dropped. On a stack with no provider
  // configured that is every route there is: the surfaces are reachable, people
  // reach them, the router resolves a route, and `ai_runs` stayed empty — which
  // reads as "nobody wants AI" when it actually means "we never wrote down that
  // they did". Zero-vendor resolutions are the ones the cost doctrine wants
  // counted FIRST, so they are now recorded as what they are.
  //
  // The synthetic case is unchanged and non-negotiable: mock output is
  // fabricated and never becomes a row.
  const disposition = auditDispositionFor(cfg.state);
  if (disposition !== "synthetic" && outcome.routing) {
    // ONE deterministic id per run, shared by both ledger rows as their PK.
    // That makes each append idempotent — nothing retries today, but a future
    // retry layer re-attempting a persist can only ever land ONE ai_runs row
    // and ONE usage_cost_events row for this run (duplicate key = already
    // persisted, never double-counted spend). The shared value also links the
    // audit row to its cost row without a new column.
    const runId = randomUUID();
    const persisted = await persistAiRunAudit(outcome.routing, {
      profileId: opts.profileId ?? null,
      requestContext: agent,
      disposition,
      runId,
    });
    // W14 Pilot Analytics slice v1: the same live run also lands as ONE
    // `usage_cost_events` row (event_type='usage', EUR cents) — the canonical
    // cost ledger's first writer. Same best-effort contract: mock/disabled
    // runs are never written, and a persistence failure never affects the
    // run outcome (it is surfaced below under the same greppable marker).
    // M-P0-8: attribute the cost to the VALIDATED active workspace's
    // organization when one exists. Resolved via the same membership-truth
    // chain as every authority consumer; outside a request context (cron)
    // or in a personal workspace this stays an honest null — a personal
    // run's cost is never assigned to an employer, and organization A's
    // request can only ever carry A (B is unreachable from A's context).
    //
    // THE COST LEDGER STAYS VENDOR-ONLY. `usage_cost_events` is the money
    // ledger, and its own CHECKs forbid a fabricated zero. A vendorless route
    // engaged no vendor, so it has no cost to record — not 0, not an estimate
    // for a model that never ran. It belongs in the audit trail above, which
    // says what happened, and NOT here, which says what it cost.
    let costPersisted = true;
    if (disposition === "vendor_run") {
      let organizationId: string | null = null;
      try {
        const attribution = await resolveAnalyticsAttribution();
        organizationId = attribution.organizationId;
      } catch {
        // no request context — honest null
      }
      costPersisted = await persistUsageCostEvent(outcome.routing, {
        profileId: opts.profileId ?? null,
        organizationId,
        requestContext: agent,
        eventId: runId,
      });
    }
    if (!persisted) {
      // W14 audit P0-2. `persistAiRunAudit` reports whether the row landed,
      // and this boolean used to be DISCARDED — so a live run whose cost was
      // never recorded looked exactly like one that was. The run itself is
      // deliberately unaffected (persistence is best-effort and must never
      // break a user-facing feature), but the loss is no longer silent: it is
      // named where it happens, under a stable marker an operator can grep and
      // alert on, and it says whether real money went unattributed.
      //
      // NOT an error: on a stack where the `ai_runs` table is absent this is
      // the EXPECTED steady state, and logging it at error level would train
      // everyone to ignore it. (Production HAS the table since the
      // 2026-08-03 apply, ledger 20260803061937 — there a persistent stream
      // of these warnings IS actionable.)
      //
      // Deliberately omits the profile id, the prompt, the payload and the
      // cost VALUE — the fact that attribution was lost is operational, the
      // contents are not.
      console.warn("[ai/cost] run not attributed — ai_runs insert did not land", {
        agent,
        tier: outcome.routing.selectedTier,
        modelAlias: outcome.routing.modelAlias ?? "none",
        hadActualCost: outcome.routing.actualCostUsd != null,
      });
    }
    if (!costPersisted) {
      // Same doctrine as above, for the cost ledger: the loss is named where
      // it happens, under the same greppable marker, without the payload,
      // the prompt or the person. Deliberately warn-level — while any
      // environment lacks the service key this is expected, not an alarm.
      console.warn("[ai/cost] run not in the cost ledger — usage_cost_events row did not land", {
        agent,
        tier: outcome.routing.selectedTier,
        modelAlias: outcome.routing.modelAlias ?? "none",
        hadActualCost: outcome.routing.actualCostUsd != null,
      });
    }
  }

  return outcome;
}
