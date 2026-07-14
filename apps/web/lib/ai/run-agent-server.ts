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
 *   - AUDIT PERSISTENCE: the routing audit record of every LIVE run is
 *     appended best-effort to the ai_runs table (runtime/audit-store.ts).
 *     Mock/disabled runs are never persisted (no synthetic rows in the audit
 *     trail). Persistence failures never affect the run outcome.
 */
import "server-only";
import { getAiRuntimeConfig } from "./runtime/config";
import {
  countAiRunsTodayBestEffort,
  persistAiRunAudit,
} from "./runtime/audit-store";
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

  const outcome = await runAiAgentCore<T>(entry, input, cfg, {
    ...opts,
    runsToday,
  });

  // Append-only audit trail for real (live) runs — never blocks the outcome.
  if (cfg.state === "live" && outcome.routing) {
    await persistAiRunAudit(outcome.routing, {
      profileId: opts.profileId ?? null,
      requestContext: agent,
    });
  }

  return outcome;
}
