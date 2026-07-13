/**
 * Provider adapter contract — declared, dependency-free registry (P9).
 *
 * A provider-neutral descriptor of every adapter this platform KNOWS about,
 * so a future shared AI Gateway (Rexora / Agentai OS) can consume the same
 * contract. This file declares seams — it wires NOTHING:
 *
 *   - `anthropic` is the only ACTIVE adapter (providers/anthropic.ts, the one
 *     allowlisted SDK importer; still env-gated + inert without a key).
 *   - `openai`, `deepl`, `meta_llama`, `xai` are `declared_inactive`: named
 *     seams only. run-core.ts keeps mapping anything non-anthropic to the
 *     disabled provider — there is NO half-built wiring behind these ids.
 *   - `sora` is `unavailable`: video generation has no task type here and is
 *     explicitly not usable.
 *
 * Guard ai-task-routing.test.ts pins that no adapter other than anthropic is
 * ever `active`. Pure. No SDK import, no env, no IO.
 */
import type { AiTaskType, TaskRouteDecision } from "../task-routing";

export type AiProviderAdapterId =
  | "anthropic"
  | "openai"
  | "deepl"
  | "meta_llama"
  | "xai"
  | "sora";

export type AiAdapterStatus = "active" | "declared_inactive" | "unavailable";

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
    status: "declared_inactive",
    capabilities: LLM_TASKS,
    notes:
      "Declared seam only — run-core.ts maps 'openai' to the disabled provider. No wiring exists.",
  },
  {
    id: "deepl",
    displayName: "DeepL",
    status: "declared_inactive",
    capabilities: ["translate_message"],
    notes: "Declared translation seam only. No client, no key handling, no wiring.",
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
    status: "declared_inactive",
    capabilities: ["explain_match", "draft_follow_up"],
    notes: "Declared seam only. No wiring exists.",
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
