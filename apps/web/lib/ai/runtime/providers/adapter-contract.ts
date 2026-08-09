/**
 * Provider adapter contract — declared, dependency-free registry (P9 ·
 * AI Router v1).
 *
 * A provider-neutral descriptor of every adapter this platform KNOWS about,
 * so a future shared AI Gateway (Rexora / Agentai OS) can consume the same
 * contract. This file describes — it wires NOTHING itself:
 *
 *   - `anthropic` is the only ACTIVE adapter (providers/anthropic.ts, the one
 *     allowlisted SDK importer; still env-gated + inert without a key).
 *   - `openai`, `gemini`, `xai`, `deepl` are `wired_env_gated`: a REAL
 *     fetch-based HTTP wire exists (providers/{openai,gemini,xai,deepl}.ts)
 *     but each adapter is DOUBLE env-gated (per-provider enable flag + key)
 *     and returns the typed disabled sentinel without both — honestly
 *     declared, never faked, reachable only through run-core dispatch.
 *   - `meta_llama` is `declared_inactive`: a named seam only — no wiring.
 *   - `sora` is `unavailable`: video generation has no task type here and is
 *     explicitly not usable.
 *
 * Guard ai-task-routing.test.ts pins that no adapter other than anthropic is
 * ever `active`, and that ONLY runtime/providers/* reference the provider API
 * hosts. Pure. No SDK import, no env, no IO.
 */
import type { AiTaskType, TaskRouteDecision } from "../task-routing";

export type AiProviderAdapterId =
  | "local"
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepl"
  | "meta_llama"
  | "xai"
  | "sora";

export type AiAdapterStatus =
  | "active"
  | "wired_env_gated"
  | "declared_inactive"
  | "unavailable";

export interface AiProviderAdapterDescriptor {
  readonly id: AiProviderAdapterId;
  readonly displayName: string;
  readonly status: AiAdapterStatus;
  /** Task types the adapter COULD serve (informational for inactive seams). */
  readonly capabilities: readonly AiTaskType[];
  readonly notes: string;
}

/** Every LLM-served task type (the two gap tasks are deterministic — no adapter). */
const LLM_TASKS: readonly AiTaskType[] = [
  "structure_future_work",
  "derive_workforce_requirements",
  "normalize_work_scope",
  "normalize_external_profile",
  "extract_cv",
  "explain_match",
  "translate_message",
  "draft_follow_up",
];

export const PROVIDER_ADAPTER_REGISTRY: readonly AiProviderAdapterDescriptor[] = [
  {
    id: "local",
    displayName: "Local OpenAI-compatible runtime",
    status: "wired_env_gated",
    capabilities: LLM_TASKS,
    notes:
      "Real chat-completions wire in providers/local.ts against an OPERATOR-CONFIGURED " +
      "base URL — no vendor host is compiled in, so it needs no provider-host " +
      "allowlist entry. The one adapter that requires NO api key: it authenticates " +
      "by network location, and AI_LOCAL_API_KEY is optional (for a reverse proxy). " +
      "Inert unless AI_PROVIDER_MODE=live + AI_LOCAL_ENABLED=true + a VALIDATED " +
      "AI_LOCAL_BASE_URL + an explicit AI_LOCAL_MODEL.",
  },
  {
    id: "anthropic",
    displayName: "Anthropic Claude",
    status: "active",
    capabilities: LLM_TASKS,
    notes:
      "The one live adapter (providers/anthropic.ts — sole allowlisted SDK importer). " +
      "Env-gated: inert without AI_PROVIDER_MODE=live + AI_API_KEY.",
  },
  {
    id: "openai",
    displayName: "OpenAI",
    status: "wired_env_gated",
    capabilities: LLM_TASKS,
    notes:
      "Real chat-completions wire in providers/openai.ts (no SDK). " +
      "Inert unless AI_PROVIDER_MODE=live + AI_PROVIDER=openai + " +
      "AI_OPENAI_ENABLED=true + OPENAI_API_KEY.",
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    status: "wired_env_gated",
    capabilities: LLM_TASKS,
    notes:
      "Real generateContent REST wire in providers/gemini.ts (no SDK). " +
      "Inert unless AI_PROVIDER_MODE=live + AI_PROVIDER=gemini + " +
      "AI_GEMINI_ENABLED=true + GEMINI_API_KEY.",
  },
  {
    id: "deepl",
    displayName: "DeepL",
    status: "wired_env_gated",
    capabilities: ["translate_message"],
    notes:
      "Real v2/translate wire in providers/deepl.ts, reached ONLY via the " +
      "translate_message languageRouting preference. Inert unless " +
      "AI_DEEPL_ENABLED=true + DEEPL_API_KEY; the LLM tier stays the fallback.",
  },
  {
    id: "meta_llama",
    displayName: "Meta Llama (self-hosted)",
    status: "declared_inactive",
    capabilities: ["normalize_work_scope", "translate_message", "draft_follow_up"],
    notes:
      "Declared low-cost/self-hosted seam only (would suit low_cost-tier tasks). No wiring exists.",
  },
  {
    id: "xai",
    displayName: "xAI Grok",
    status: "wired_env_gated",
    capabilities: LLM_TASKS,
    notes:
      "Real OpenAI-compatible chat-completions wire in providers/xai.ts (no SDK). " +
      "Inert unless AI_PROVIDER_MODE=live + AI_PROVIDER=xai + " +
      "AI_XAI_ENABLED=true + XAI_API_KEY.",
  },
  {
    id: "sora",
    displayName: "OpenAI Sora (video)",
    status: "unavailable",
    capabilities: [],
    notes:
      "Video generation — no Labour Market OS task type maps to it; explicitly not usable.",
  },
];

export type AdapterSelection =
  | { readonly kind: "adapter"; readonly adapter: AiProviderAdapterDescriptor }
  | { readonly kind: "no_adapter"; readonly reason: string };

/**
 * Pick the adapter for a resolved route. Only ever returns an ACTIVE adapter
 * that can serve the task — otherwise an honest `no_adapter` result. It can
 * never "activate" a declared seam.
 */
export function selectAdapterForRoute(
  decision: TaskRouteDecision,
): AdapterSelection {
  if (decision.tier === "deterministic") {
    return {
      kind: "no_adapter",
      reason: "deterministic task — computed by pure models, no provider needed",
    };
  }
  if (decision.blocked) {
    return {
      kind: "no_adapter",
      reason: `route blocked (${decision.blocked}) — no provider may run`,
    };
  }
  const adapter = PROVIDER_ADAPTER_REGISTRY.find(
    (a) => a.status === "active" && a.capabilities.includes(decision.taskType),
  );
  if (!adapter) {
    return {
      kind: "no_adapter",
      reason: `no active adapter supports task "${decision.taskType}"`,
    };
  }
  return { kind: "adapter", adapter };
}
