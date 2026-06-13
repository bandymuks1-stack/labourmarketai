/**
 * Agent runner — SERVER wrapper (Internal LLM Agents v1, PR3).
 *
 * Resolves env runtime config + the registered prompt and runs the agent.
 * Server-only (must never be imported by a client component — enforced by
 * no-direct-llm-client-call).
 */
import "server-only";
import { getAiRuntimeConfig } from "./runtime/config";
import { getPromptEntry } from "./registry/registry";
import { runAiAgentCore, type AiAgentOutcome, type RunAgentOptions } from "./run-agent";
import type { AiAgentKey } from "./registry/types";

export async function runAiAgent<T = unknown>(
  agent: AiAgentKey,
  input: unknown,
  opts: RunAgentOptions,
): Promise<AiAgentOutcome<T>> {
  const entry = getPromptEntry(agent);
  return runAiAgentCore<T>(entry, input, getAiRuntimeConfig(), opts);
}
