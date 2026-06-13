/**
 * Mock completion provider — deterministic, network-free (Internal LLM Agents v1).
 *
 * Activated by AI_PROVIDER_MODE=mock. It returns the caller-supplied `mock`
 * payload as the raw output, so the WHOLE agent pipeline (input build → run →
 * strict-schema validation → suggestion) is exercised in tests/dev WITHOUT any
 * API key, network call, or SDK. If no `mock` payload is supplied it returns
 * `raw: null` — the agent's strict schema then rejects it, exactly as a
 * malformed live output would, so the "needs human / unavailable" path is
 * covered too.
 *
 * The mock NEVER reaches a network and reads NO env. It cannot leak a secret.
 *
 * Pure. No IO.
 */
import type { AiCompletionProvider, AiCompletionResult } from "../types";
import type { AiRuntimeConfig } from "../config-core";

export const mockCompletionProvider: AiCompletionProvider = {
  kind: "mock",
  async complete(request, cfg: AiRuntimeConfig): Promise<AiCompletionResult> {
    return {
      status: "ok",
      provider: "mock",
      model: cfg.model,
      raw: request.mock ?? null,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  },
};
