/**
 * AI completion dispatch — pure selection core (Internal LLM Agents v1, PR2 ·
 * AI Router v1).
 *
 * Given a resolved {@link AiRuntimeConfig}, selects the active provider and runs
 * one completion. No env read, no server-only: importable by tests so the whole
 * disabled / mock / live selection is exercised without keys. The server
 * wrapper (run.ts) supplies the env-resolved config.
 *
 * Provider selection rules (cheapest-sufficient still rules — the model TIER
 * comes from task routing, this layer only picks the transport):
 *   - disabled / mock behave exactly as before;
 *   - the primary live provider is cfg.provider (anthropic | openai | gemini |
 *     xai). Non-anthropic adapters are fetch-based and DOUBLE env-gated
 *     (per-provider enable flag + key) — without both they return the typed
 *     disabled sentinel, never a faked result;
 *   - a routing languageRouting preference (request.preferredProvider, e.g.
 *     "deepl" for translate_message) is TRIED FIRST on live runs; any non-ok
 *     result falls through honestly to the primary provider.
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
import { openaiCompletionProvider } from "./providers/openai";
import { geminiCompletionProvider } from "./providers/gemini";
import { xaiCompletionProvider } from "./providers/xai";
import { deeplCompletionProvider } from "./providers/deepl";

export function selectCompletionProvider(
  kind: ReturnType<typeof providerKindFor>,
): AiCompletionProvider {
  switch (kind) {
    case "mock":
      return mockCompletionProvider;
    case "anthropic":
      return anthropicCompletionProvider;
    case "openai":
      return openaiCompletionProvider;
    case "gemini":
      return geminiCompletionProvider;
    case "xai":
      return xaiCompletionProvider;
    case "disabled":
    default:
      return disabledCompletionProvider;
  }
}

export async function dispatchAiCompletion(
  request: AiCompletionRequest,
  cfg: AiRuntimeConfig,
): Promise<AiCompletionResult> {
  const kind = providerKindFor(cfg);

  // Language-routing preference (task policy → e.g. DeepL for
  // translate_message). Live runs only — mock stays deterministic and
  // disabled stays inert. A not-configured / failing secondary provider
  // falls through to the primary LLM tier; nothing is faked.
  if (request.preferredProvider === "deepl" && kind !== "disabled" && kind !== "mock") {
    const preferred = await deeplCompletionProvider.complete(request, cfg);
    if (preferred.status === "ok") return preferred;
  }

  const provider = selectCompletionProvider(kind);
  return provider.complete(request, cfg);
}
