/**
 * AI completion dispatch — provider selection + CHAIN TRAVERSAL.
 *
 * Two dispatch paths live here, and the difference between them is whether the
 * caller supplied a routed task.
 *
 * LEGACY PATH (no chain context) — unchanged, byte for byte in behaviour: one
 * provider, `cfg.provider`, selected by `providerKindFor`. Every existing
 * caller and test keeps working exactly as before.
 *
 * CHAIN PATH (chain context supplied) — the one #1102 built the ordering module
 * for and could not yet use. `resolveProviderChain` produces an ORDERED list of
 * candidates that may serve this task, cheapest class first and privacy-vetoed;
 * this file walks it. A candidate that fails is CLASSIFIED, and the class — not
 * the fact of failure — decides whether the next candidate is tried at all.
 *
 * WHAT THIS FIXES. Before it, "Anthropic has no key" and "this task has nowhere
 * to run" were the same event: one provider, no successor, one indistinguishable
 * failure. Now a run ends in one of four honestly different places — a provider
 * answered, the deterministic path applies, every candidate was tried and named,
 * or no candidate was ever allowed to see the payload.
 *
 * WHAT IT REFUSES TO DO. It never retries a request-attributed failure across
 * the whole chain (see `advancePolicyFor`), because handing the same personal
 * payload to four vendors to receive the same malformed answer is a disclosure
 * with no upside. And it can never promote a provider the operator did not
 * configure: health is observed by `provider-health.ts` from real config, and
 * only `ready` is ever a candidate.
 *
 * Pure-ish: no env read, no server-only. The adapters own their own env gates,
 * and the states come in from the server boundary.
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
import { xaiCompletionProvider } from "./providers/xai";
import { transportForProvider } from "./model-registry";
import { openaiCompletionProvider } from "./providers/openai";
import { geminiCompletionProvider } from "./providers/gemini";
import { deeplCompletionProvider } from "./providers/deepl";
import { localCompletionProvider } from "./providers/local";
import {
  advancePolicyFor,
  classifyCompletionFailure,
  resolveProviderChain,
  AI_PROVIDER_PROFILES,
  type AiChainProviderId,
  type AiProviderProfile,
  type AiProviderState,
  type ChainCandidate,
} from "./provider-chain";
import type { TaskRouteDecision } from "./task-routing";

export function selectCompletionProvider(
  kind: ReturnType<typeof providerKindFor>,
): AiCompletionProvider {
  switch (kind) {
    case "mock":
      return mockCompletionProvider;
    case "local":
      return localCompletionProvider;
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

/** Chain id → adapter. Separate from `selectCompletionProvider` because the
 *  chain addresses a provider directly, not through `cfg.provider`. */
/**
 * Adapter for a chain provider, or null when nothing can serve it.
 *
 * TRANSPORT, NOT VENDOR. This used to be an exhaustive switch over a closed
 * five-value union, which is why a newly registered provider could be priced
 * and ordered yet have no way to run. It now asks the registry which WIRE
 * PROTOCOL the provider speaks and returns the adapter for that protocol, so
 * every OpenAI-compatible entrant — Qwen via Model Studio, and the rest —
 * reaches an existing adapter as registry data rather than a new case here.
 *
 * TOTAL, AND FAILS CLOSED. Returning null rather than falling through to
 * `undefined` is the whole point: with the union opened, an unrecognised id
 * would otherwise have crashed at `.complete()`. The caller degrades honestly
 * instead — "no adapter" and "the adapter failed" stay different sentences.
 */
function adapterForChainId(id: AiChainProviderId): AiCompletionProvider | null {
  // `local` is not registry-bound: it serves whatever model the operator
  // pulled, so it has no fixed model id and is matched by provider directly.
  if (id === "local") return localCompletionProvider;
  switch (transportForProvider(id)) {
    case "anthropic":
      return anthropicCompletionProvider;
    case "gemini":
      return geminiCompletionProvider;
    case "openai-compatible":
      // One adapter for the whole OpenAI-protocol family. Which vendor it
      // reaches is a base-URL/env concern owned by the adapter, not a branch.
      return openaiCompletionProvider;
    default:
      return null;
  }
}

/** What the chain path needs that the legacy path does not. */
export interface ChainDispatchContext {
  /** The resolved route — supplies the task type and any block. */
  readonly decision: TaskRouteDecision;
  /** Observed provider readiness (provider-health.ts). */
  readonly states: readonly AiProviderState[];
  /**
   * Profile table override. Production always uses the shipped
   * `AI_PROVIDER_PROFILES`; this exists so a test can INJECT a cost class that
   * does not exist yet — without it, the free-tier privacy veto has no subject
   * and could not be proven at the dispatch/adapter-invocation level at all.
   */
  readonly profiles?: readonly AiProviderProfile[];
}

/**
 * Try the DeepL translation preference first, when the policy asked for it.
 * Unchanged behaviour, lifted into a helper so both paths share it: a
 * not-configured or failing secondary provider falls through honestly to the
 * LLM tier, and nothing is faked.
 */
async function tryPreferredSecondary(
  request: AiCompletionRequest,
  cfg: AiRuntimeConfig,
): Promise<AiCompletionResult | null> {
  if (request.preferredProvider !== "deepl") return null;
  const preferred = await deeplCompletionProvider.complete(request, cfg);
  return preferred.status === "ok" ? preferred : null;
}

export async function dispatchAiCompletion(
  request: AiCompletionRequest,
  cfg: AiRuntimeConfig,
  chain?: ChainDispatchContext,
): Promise<AiCompletionResult> {
  const kind = providerKindFor(cfg);

  // mock and disabled are WHOLE-RUNTIME states. They short-circuit both paths:
  // a chain that reached a real adapter underneath `mock` would make the mock
  // runtime meaningless, and one that reached a real adapter underneath
  // `disabled` would be the exact failure the disabled state exists to prevent.
  if (kind === "mock" || kind === "disabled") {
    return selectCompletionProvider(kind).complete(request, cfg);
  }

  if (!chain) {
    // ── Legacy path — one provider, exactly as before. ────────────────────
    const preferred = await tryPreferredSecondary(request, cfg);
    if (preferred) return preferred;
    return selectCompletionProvider(kind).complete(request, cfg);
  }

  // ── Chain path ────────────────────────────────────────────────────────────
  const outcome = resolveProviderChain(
    chain.decision,
    chain.states,
    chain.profiles ?? AI_PROVIDER_PROFILES,
  );

  if (outcome.kind === "deterministic") {
    // The caller should have computed this without us. Say so precisely rather
    // than returning an empty "ok" that looks like a model answered.
    return {
      status: "error",
      code: "unsupported",
      message: outcome.reason,
    };
  }
  if (outcome.kind === "unavailable") {
    // Name every candidate and why it was passed over. This string is the
    // difference between "the AI is off" and "everything is down", which used
    // to be the same silence.
    const detail = outcome.skipped
      .map((s) => `${s.id}: ${s.reason}`)
      .join("; ");
    return {
      status: "error",
      code: "unsupported",
      message: detail ? `${outcome.reason} — ${detail}` : outcome.reason,
    };
  }

  const preferred = await tryPreferredSecondary(request, cfg);
  if (preferred) return preferred;

  const candidates: ChainCandidate[] = [outcome.selected, ...outcome.remaining];
  let invalidOutputRetries = 0;
  let last: AiCompletionResult = {
    status: "error",
    code: "unsupported",
    message: "chain produced no candidate",
  };

  for (const candidate of candidates) {
    const adapter = adapterForChainId(candidate.id);
    if (adapter === null) {
      // Registered and ordered, but nothing speaks its protocol. Skip it with
      // an honest reason rather than crashing — the next candidate may serve.
      last = {
        status: "error",
        code: "unsupported",
        message: `no adapter for provider "${candidate.id}" — its transport is unknown to this runtime`,
        provider: candidate.id,
      };
      continue;
    }
    const result = await adapter.complete(request, cfg);
    if (result.status === "ok") return result;

    // Attribute the failure to the provider that produced it, so an audit
    // record cannot claim the primary provider failed when a different
    // candidate did.
    last = { ...result, provider: candidate.id };

    const failure = classifyCompletionFailure(result);
    if (failure === null) return result;
    const policy = advancePolicyFor(failure);
    if (policy === "stop") break;
    if (policy === "advance_once") {
      if (invalidOutputRetries >= 1) break;
      invalidOutputRetries += 1;
    }
  }

  return last;
}
