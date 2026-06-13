/**
 * Agent runner — SERVER wrapper (Internal LLM Agents v1, PR3 + PR4 audit).
 *
 * Resolves env runtime config + the registered prompt, runs the agent, and
 * writes an append-only ai_runs audit row (best-effort, hashes only — never raw
 * input/output, never a secret). Server-only (must never be imported by a client
 * component — enforced by no-direct-llm-client-call).
 */
import "server-only";
import { getAiRuntimeConfig } from "./runtime/config";
import { getPromptEntry } from "./registry/registry";
import { runAiAgentCore, type AiAgentOutcome, type RunAgentOptions } from "./run-agent";
import { recordAiRun, type AiRunWriteResult } from "./audit/ai-run-store";
import type { AiRunStatus } from "./audit/ai-run-row";
import type { AiAgentKey } from "./registry/types";

function auditStatus(outcome: AiAgentOutcome): AiRunStatus {
  switch (outcome.status) {
    case "suggestion":
      return "suggestion";
    case "disabled":
      return "disabled";
    default:
      return "needs_review";
  }
}

export interface RunAiAgentResult<T> {
  readonly outcome: AiAgentOutcome<T>;
  readonly audit: AiRunWriteResult;
}

export async function runAiAgent<T = unknown>(
  agent: AiAgentKey,
  input: unknown,
  opts: RunAgentOptions,
): Promise<RunAiAgentResult<T>> {
  const entry = getPromptEntry(agent);
  const cfg = getAiRuntimeConfig();
  const outcome = await runAiAgentCore<T>(entry, input, cfg, opts);

  // Append-only audit (§7.1) — hashes only, never raw content or a secret.
  const audit = await recordAiRun({
    ownerId: opts.ownerId ?? null,
    orgId: opts.orgId ?? null,
    agentKey: entry.agent,
    promptVersion: entry.version,
    provider:
      outcome.status === "suggestion" ? outcome.provider : cfg.state === "live" ? cfg.provider : cfg.state,
    model: outcome.status === "suggestion" ? outcome.model : cfg.model,
    status: auditStatus(outcome),
    errorCode: outcome.status === "needs_review" ? outcome.reason : undefined,
    input,
    output: outcome.status === "suggestion" ? outcome.value : undefined,
  });

  return { outcome, audit };
}
