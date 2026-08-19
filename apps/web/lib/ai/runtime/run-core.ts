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
import type { AiEgressGrant } from "./data-egress";
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
 * AN EXPLICIT PER-PROVIDER BINDING, and it has to be. An earlier version of
 * this dispatched by WIRE PROTOCOL — every `openai-compatible` provider
 * returning `openaiCompletionProvider` — on the reasoning that one protocol
 * needs one implementation. That was wrong in a way worth recording: each
 * adapter hardcodes its OWN endpoint, key env var, enable flag and model map
 * (`api.openai.com` + `OPENAI_API_KEY` vs `api.x.ai` + `XAI_API_KEY`). Sharing
 * the adapter would have sent an xAI-selected payload to OpenAI's endpoint
 * under OpenAI's key — a different vendor than the chain chose — and would have
 * reported an xAI-only deployment as disabled.
 *
 * `transport` on the registry entry still records protocol compatibility, which
 * is true and useful: it says a future parameterised adapter COULD serve that
 * provider. It does not by itself say credentials exist for it. Until the
 * openai-compatible adapter takes its base URL, key and model map per provider,
 * a newly registered provider needs a binding here before it can run — and
 * gets an honest refusal, not another vendor's endpoint, until it has one.
 *
 * TOTAL, AND FAILS CLOSED. A lookup rather than an exhaustive switch, because
 * `AiChainProviderId` is now open: an unrecognised id must degrade honestly,
 * never fall through to `undefined` and crash at `.complete()`. "No adapter"
 * and "the adapter failed" stay different sentences.
 */
const ADAPTER_BY_PROVIDER: Readonly<Record<string, AiCompletionProvider>> = {
  // `local` is not registry-bound: it serves whatever model the operator
  // pulled, so it has no fixed model id and is matched by provider directly.
  local: localCompletionProvider,
  anthropic: anthropicCompletionProvider,
  openai: openaiCompletionProvider,
  gemini: geminiCompletionProvider,
  xai: xaiCompletionProvider,
};

function adapterForChainId(id: AiChainProviderId): AiCompletionProvider | null {
  return ADAPTER_BY_PROVIDER[id] ?? null;
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
  /**
   * Egress-grant override. Production always uses the shipped
   * `AI_EGRESS_GRANTS`, which is EMPTY by owner decision — so without this a
   * test could not reach a cloud adapter at all, and the dispatch-level
   * mechanics (fallback ordering, adapter invocation) would be unprovable.
   * Injecting a grant here is the counterpart of injecting a profile above.
   */
  readonly grants?: readonly AiEgressGrant[];
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
    chain.grants,
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
        message: `no adapter bound for provider "${candidate.id}" — it needs an endpoint/key binding before it can run`,
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
