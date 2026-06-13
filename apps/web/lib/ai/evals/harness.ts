/**
 * Eval harness (Internal LLM Agents v1, PR3).
 *
 * Runs an agent end-to-end through the MOCK provider (no env, key, or network)
 * and returns the typed outcome, so fixtures can assert that real outputs pass
 * validation and unsafe outputs are rejected. This is the runnable proof that
 * the agent pipeline + strict-schema enforcement work without any live provider.
 */
import { resolveAiRuntimeConfig } from "../runtime/config-core";
import { runAiAgentCore, type AiAgentOutcome } from "../run-agent";
import type { PromptRegistryEntry } from "../registry/types";
import type { AiLocale } from "../runtime/types";

export interface AgentEvalCase {
  readonly name: string;
  readonly locale: AiLocale;
  readonly input: unknown;
  /** The canned model output the mock provider returns for this case. */
  readonly mock: unknown;
  readonly expect:
    | { readonly status: "suggestion" }
    | { readonly status: "needs_review"; readonly reason?: string }
    | { readonly status: "disabled" };
}

const MOCK_CFG = resolveAiRuntimeConfig({
  mode: "mock",
  provider: undefined,
  apiKey: undefined,
  model: undefined,
  timeoutMs: undefined,
  maxRetries: undefined,
  maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

export async function runAgentEval(
  entry: PromptRegistryEntry,
  c: AgentEvalCase,
): Promise<AiAgentOutcome> {
  return runAiAgentCore(entry, c.input, MOCK_CFG, {
    locale: c.locale,
    mock: c.mock,
  });
}
