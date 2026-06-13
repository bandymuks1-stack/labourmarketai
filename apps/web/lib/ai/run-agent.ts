/**
 * Agent runner (Internal LLM Agents v1, PR3).
 *
 * The single path every internal agent runs through. It:
 *   1. validates the structured INPUT against the registry entry's schema;
 *   2. dispatches one completion (disabled / mock / live);
 *   3. validates the RAW model output against the entry's STRICT envelope schema
 *      — raw output is NEVER returned unvalidated (ai-output-schema-required);
 *   4. returns a typed outcome: suggestion | disabled | needs_review.
 *
 * `runAiAgentCore` is pure (takes a resolved config) so the whole pipeline is
 * unit/eval-tested via the mock provider with no env, key, or network. The
 * server wrapper `runAiAgent` resolves env config + the prompt entry.
 */
import { dispatchAiCompletion } from "./runtime/run-core";
import type { AiRuntimeConfig, AiDisabledReason } from "./runtime/config-core";
import type { AiCompletionRequest, AiLocale, AiErrorCode } from "./runtime/types";
import type { PromptRegistryEntry, AiAgentKey } from "./registry/types";

export type AiAgentReviewReason =
  | "invalid_input"
  | "schema_rejected"
  | AiErrorCode;

export type AiAgentOutcome<T = unknown> =
  | {
      readonly status: "suggestion";
      readonly agent: AiAgentKey;
      readonly provider: string;
      readonly model: string;
      readonly value: T;
    }
  | { readonly status: "disabled"; readonly reason: AiDisabledReason }
  | {
      readonly status: "needs_review";
      readonly reason: AiAgentReviewReason;
      readonly detail?: string;
    };

export interface RunAgentOptions {
  readonly locale: AiLocale;
  readonly maxOutputTokens?: number;
  /** Deterministic mock output for tests/dev (ignored by the live provider). */
  readonly mock?: unknown;
  /** Audit context (server wrapper writes an ai_runs row; hashes only). */
  readonly ownerId?: string | null;
  readonly orgId?: string | null;
}

export async function runAiAgentCore<T = unknown>(
  entry: PromptRegistryEntry,
  input: unknown,
  cfg: AiRuntimeConfig,
  opts: RunAgentOptions,
): Promise<AiAgentOutcome<T>> {
  // 1. Validate input — a bad input never reaches the model.
  const parsedInput = entry.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { status: "needs_review", reason: "invalid_input", detail: parsedInput.error.message };
  }

  const request: AiCompletionRequest = {
    agentKey: entry.agent,
    promptVersion: entry.version,
    system: entry.system,
    input: parsedInput.data,
    locale: opts.locale,
    maxOutputTokens: opts.maxOutputTokens,
    mock: opts.mock,
  };

  const result = await dispatchAiCompletion(request, cfg);

  if (result.status === "disabled") {
    return { status: "disabled", reason: result.reason };
  }
  if (result.status === "error") {
    return { status: "needs_review", reason: result.code, detail: result.message };
  }

  // 3. Validate RAW output against the STRICT envelope — discard if off-shape.
  const parsedOutput = entry.outputSchema.safeParse(result.raw);
  if (!parsedOutput.success) {
    return {
      status: "needs_review",
      reason: "schema_rejected",
      detail: parsedOutput.error.message,
    };
  }

  return {
    status: "suggestion",
    agent: entry.agent,
    provider: result.provider,
    model: result.model,
    value: parsedOutput.data as T,
  };
}
