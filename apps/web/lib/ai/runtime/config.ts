/**
 * AI runtime config — SERVER wrapper (Internal LLM Agents v1, PR2).
 *
 * Feeds the validated env (lib/env.ts) into the pure resolver. Server-only so
 * env secrets never reach a client bundle; the pure core (config-core.ts) is
 * what tests and guards import.
 */
import "server-only";
import { env } from "@/lib/env";
import { resolveAiRuntimeConfig, type AiRuntimeConfig } from "./config-core";

/** The key that proves the SELECTED primary provider is usable: the
 *  provider-specific key when set, else the generic AI_API_KEY (which the
 *  anthropic adapter reads). Presence-only — the value never leaves env. */
function apiKeyForProvider(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return env.OPENAI_API_KEY ?? env.AI_API_KEY;
    case "gemini":
      return env.GEMINI_API_KEY ?? env.AI_API_KEY;
    case "xai":
      return env.XAI_API_KEY ?? env.AI_API_KEY;
    default:
      return env.AI_API_KEY;
  }
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  return resolveAiRuntimeConfig({
    mode: env.AI_PROVIDER_MODE,
    provider: env.AI_PROVIDER,
    apiKey: apiKeyForProvider(env.AI_PROVIDER),
    model: env.AI_MODEL,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    dailyRunBudget: env.AI_DAILY_RUN_BUDGET,
  });
}
