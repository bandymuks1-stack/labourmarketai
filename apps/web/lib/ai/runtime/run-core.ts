/**
 * AI completion dispatch — pure selection core (Internal LLM Agents v1, PR2).
 *
 * Given a resolved {@link AiRuntimeConfig}, selects the active provider and runs
 * one completion. No env read, no server-only: importable by tests so the whole
 * disabled / mock / live selection is exercised without keys. The server
 * wrapper (run.ts) supplies the env-resolved config.
 *
 * The OpenAI provider is a declared seam only — not wired in v1, so it resolves
 * to `disabled` (honest: no half-built provider can run).
 */
import { providerKindFor, type AiRuntimeConfig } from "./config-core";
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "./types";
import { disabledCompletionProvider } from "./providers/disabled";
import { mockCompletionProvider } from "./providers/mock";
import { anthropicCompletionProvider } from "./providers/anthropic";

export function selectCompletionProvider(
  kind: ReturnType<typeof providerKindFor>,
): AiCompletionProvider {
  switch (kind) {
    case "mock":
      return mockCompletionProvider;
    case "anthropic":
      return anthropicCompletionProvider;
    // openai is a documented seam, NOT wired in v1 → inert.
    case "openai":
    case "disabled":
    default:
      return disabledCompletionProvider;
  }
}

export async function dispatchAiCompletion(
  request: AiCompletionRequest,
  cfg: AiRuntimeConfig,
): Promise<AiCompletionResult> {
  const provider = selectCompletionProvider(providerKindFor(cfg));
  return provider.complete(request, cfg);
}
