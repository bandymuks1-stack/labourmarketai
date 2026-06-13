/**
 * AI completion runner — SERVER entry point (Internal LLM Agents v1, PR2).
 *
 * The single function product code calls to run one agent completion. It
 * resolves the env-backed runtime config and dispatches to the active provider
 * (disabled by default; mock in tests/dev; live only with AI_PROVIDER_MODE=live
 * + a key). Server-only: it must never be imported by a React client component
 * (enforced by lib/guards/no-direct-llm-client-call.test.ts).
 */
import "server-only";
import { getAiRuntimeConfig } from "./config";
import { dispatchAiCompletion } from "./run-core";
import type { AiCompletionRequest, AiCompletionResult } from "./types";

export async function runAiCompletion(
  request: AiCompletionRequest,
): Promise<AiCompletionResult> {
  return dispatchAiCompletion(request, getAiRuntimeConfig());
}

export { getAiRuntimeConfig };
