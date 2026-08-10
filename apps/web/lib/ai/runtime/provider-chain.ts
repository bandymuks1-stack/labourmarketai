/**
 * Free-first provider chain — PURE ordering + degradation policy.
 *
 * The runtime already knows HOW to call four cloud vendors. What it could not
 * express is an ORDER, and that gap had two consequences:
 *
 *   - `selectAdapterForRoute` returns the first adapter whose status is
 *     `active`, and only `anthropic` is ever active. One provider, no
 *     successor: if it is unconfigured or down, the task simply has no path.
 *   - `resolveAiRuntimeConfig` makes `live` conditional on a NON-EMPTY api key,
 *     so a keyless local runtime (Ollama, LM Studio, any OpenAI-compatible
 *     server on the operator's own machine) could not be represented at all —
 *     the owner's stated preference was structurally unreachable, not merely
 *     unimplemented.
 *
 * This module supplies the missing middle: given the task and the observed
 * state of each provider, it produces the ordered list of candidates and the
 * honest outcome when none of them can serve. It decides nothing about HOW to
 * call a provider and imports no adapter — `run-core` still owns dispatch.
 *
 * ORDERING IS COST-CLASS FIRST, and deliberately so. A free local model that
 * can serve the task is tried before a free cloud tier, which is tried before
 * anything metered. Within one cost class, `priority` breaks the tie. Nothing
 * here can promote a provider the operator has not configured: health comes
 * from the caller, and only `ready` is ever a candidate.
 *
 * DEGRADATION IS EXPLICIT. The chain never ends in a thrown error or a silent
 * empty result. It ends in exactly one of three outcomes — a provider, the
 * deterministic path, or an honest `unavailable` carrying the reason every
 * candidate was skipped. "The AI is off" and "every provider failed" are
 * different sentences and the caller can tell them apart.
 *
 * Pure. No IO, no env, no server-only, no SDK import.
 */
import type { AiTaskType, TaskRouteDecision } from "./task-routing";
import {
  providerEligibleForSensitivity,
  sensitivityForTask,
  type AiDataSensitivity,
} from "./data-sensitivity";

/** Provider ids the chain can order. `local` is the keyless self-hosted seam. */
export type AiChainProviderId =
  | "local"
  | "anthropic"
  | "openai"
  | "gemini"
  | "xai";

/**
 * What running this provider costs the owner.
 *
 * `free_local`  — runs on hardware the operator already owns. No key, no bill,
 *                 no third party receives the prompt.
 * `free_tier`   — a cloud vendor's no-charge allowance. Still a third party,
 *                 still rate-limited, and the terms can change; a provider is
 *                 only ever placed here on CURRENT verified documentation.
 * `paid`        — metered. Reachable only when the owner explicitly enables it.
 * `disabled`    — known to the platform, never selectable.
 */
export type AiProviderCostClass =
  | "free_local"
  | "free_tier"
  | "paid"
  | "disabled";

/** Observed readiness. Only `ready` is ever a chain candidate. */
export type AiProviderHealth =
  | "ready"
  /** Enabled in principle but missing its key / base URL. */
  | "unconfigured"
  /** Configured but the last probe or call failed. */
  | "unavailable"
  /** Turned off by the operator, or not permitted for this task. */
  | "disabled";

export interface AiProviderProfile {
  readonly id: AiChainProviderId;
  readonly displayName: string;
  readonly costClass: AiProviderCostClass;
  /** False ONLY for a provider that authenticates by network location. */
  readonly requiresKey: boolean;
  readonly locality: "local" | "cloud";
  /** Task types this provider may serve. */
  readonly capabilities: readonly AiTaskType[];
  /** Whether it can be held to a JSON schema without post-hoc repair. */
  readonly structuredOutput: boolean;
  /** Tie-break inside one cost class. Lower is tried first. */
  readonly priority: number;
}

export interface AiProviderState {
  readonly id: AiChainProviderId;
  readonly health: AiProviderHealth;
  /** Why it is not ready — surfaced verbatim in the unavailable outcome. */
  readonly reason?: string;
}

export interface ChainCandidate {
  readonly id: AiChainProviderId;
  readonly costClass: AiProviderCostClass;
  readonly locality: "local" | "cloud";
}

export interface SkippedCandidate {
  readonly id: AiChainProviderId;
  readonly reason: string;
}

export type ChainOutcome =
  /** A provider can serve the task now. */
  | {
      readonly kind: "provider";
      readonly selected: ChainCandidate;
      /** Providers ranked ahead of the winner that could not serve, in order. */
      readonly skipped: readonly SkippedCandidate[];
      /** The rest of the chain, still in order, for retry after a failure. */
      readonly remaining: readonly ChainCandidate[];
    }
  /** The task is computed by pure models — no provider is involved. */
  | { readonly kind: "deterministic"; readonly reason: string }
  /** Nothing can serve it. The caller must degrade, not guess. */
  | {
      readonly kind: "unavailable";
      readonly reason: string;
      readonly skipped: readonly SkippedCandidate[];
    };

const COST_RANK: Record<AiProviderCostClass, number> = {
  free_local: 0,
  free_tier: 1,
  paid: 2,
  // Never ordered — filtered out before sorting. Present so the map is total.
  disabled: 99,
};

/**
 * The providers the platform knows how to order.
 *
 * COST CLASS HERE IS A CLAIM ABOUT BILLING, NOT AN ACTIVATION. Every entry is
 * inert until the operator configures it and the caller reports `ready`, and
 * `free_tier` placements must be re-checked against current vendor terms —
 * a tier that was free once is not evidence it is free now.
 *
 * `local` carries `requiresKey: false` because it authenticates by being on a
 * network the operator controls. That is the single property the old config
 * could not express.
 */
export const AI_PROVIDER_PROFILES: readonly AiProviderProfile[] = [
  {
    id: "local",
    displayName: "Local OpenAI-compatible runtime",
    costClass: "free_local",
    requiresKey: false,
    locality: "local",
    capabilities: [
      "structure_future_work",
      "derive_workforce_requirements",
      "normalize_work_scope",
      "normalize_external_profile",
      "extract_cv",
      "explain_match",
      "translate_message",
      "draft_follow_up",
    ],
    // Small local models drift from a schema more often than the frontier
    // cloud models do, so the runtime keeps its JSON repair pass for them.
    structuredOutput: false,
    priority: 0,
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    costClass: "paid",
    requiresKey: true,
    locality: "cloud",
    capabilities: [
      "structure_future_work",
      "derive_workforce_requirements",
      "normalize_work_scope",
      "normalize_external_profile",
      "extract_cv",
      "explain_match",
      "translate_message",
      "draft_follow_up",
    ],
    structuredOutput: true,
    priority: 10,
  },
  {
    id: "anthropic",
    displayName: "Anthropic Claude",
    costClass: "paid",
    requiresKey: true,
    locality: "cloud",
    capabilities: [
      "structure_future_work",
      "derive_workforce_requirements",
      "normalize_work_scope",
      "normalize_external_profile",
      "extract_cv",
      "explain_match",
      "translate_message",
      "draft_follow_up",
    ],
    structuredOutput: true,
    priority: 20,
  },
  {
    id: "openai",
    displayName: "OpenAI",
    costClass: "paid",
    requiresKey: true,
    locality: "cloud",
    capabilities: [
      "structure_future_work",
      "derive_workforce_requirements",
      "normalize_work_scope",
      "normalize_external_profile",
      "extract_cv",
      "explain_match",
      "translate_message",
      "draft_follow_up",
    ],
    structuredOutput: true,
    priority: 30,
  },
  {
    id: "xai",
    displayName: "xAI Grok",
    costClass: "paid",
    requiresKey: true,
    locality: "cloud",
    capabilities: [
      "structure_future_work",
      "derive_workforce_requirements",
      "normalize_work_scope",
      "normalize_external_profile",
      "extract_cv",
      "explain_match",
      "translate_message",
      "draft_follow_up",
    ],
    structuredOutput: true,
    priority: 40,
  },
];

export function profileFor(
  id: AiChainProviderId,
): AiProviderProfile | undefined {
  return AI_PROVIDER_PROFILES.find((p) => p.id === id);
}

/**
 * Providers that could serve this task, cheapest class first.
 *
 * Capability is checked before health so an unconfigured provider that could
 * never serve the task is not reported as a near miss.
 */
export function orderedCandidatesFor(
  taskType: AiTaskType,
  profiles: readonly AiProviderProfile[] = AI_PROVIDER_PROFILES,
): readonly AiProviderProfile[] {
  return profiles
    .filter(
      (p) => p.costClass !== "disabled" && p.capabilities.includes(taskType),
    )
    .slice()
    .sort(
      (a, b) =>
        COST_RANK[a.costClass] - COST_RANK[b.costClass] ||
        a.priority - b.priority,
    );
}

function healthReason(state: AiProviderState | undefined): string {
  if (!state) return "no state reported — treated as unconfigured";
  if (state.reason) return state.reason;
  switch (state.health) {
    case "unconfigured":
      return "not configured";
    case "unavailable":
      return "last call or probe failed";
    case "disabled":
      return "disabled by the operator";
    default:
      return "ready";
  }
}

/**
 * Resolve the whole chain for one routed task.
 *
 * Deterministic tasks and blocked routes short-circuit BEFORE any provider is
 * considered — a cost ceiling or a missing human confirmation must not be
 * reportable as "no provider available", because the two call for completely
 * different responses from the caller.
 *
 * ELIGIBILITY IS CHECKED BEFORE HEALTH, and the order matters. A provider that
 * may not lawfully receive this payload is not a provider that happens to be
 * down: it must be excluded whether it is healthy or not, and it must be
 * excluded for a reason that says so. Checking health first would let a
 * privacy exclusion hide behind "unconfigured" and silently become eligible the
 * day someone adds a key.
 */
export function resolveProviderChain(
  decision: TaskRouteDecision,
  states: readonly AiProviderState[],
  profiles: readonly AiProviderProfile[] = AI_PROVIDER_PROFILES,
): ChainOutcome {
  if (decision.tier === "deterministic") {
    return {
      kind: "deterministic",
      reason:
        "deterministic task — computed by pure workforce models, no provider needed",
    };
  }
  if (decision.blocked) {
    return {
      kind: "unavailable",
      reason: `route blocked (${decision.blocked}) — no provider may run`,
      skipped: [],
    };
  }

  const byId = new Map(states.map((s) => [s.id, s]));
  const ordered = orderedCandidatesFor(decision.taskType, profiles);
  const sensitivity = sensitivityForTask(decision.taskType);
  const skipped: SkippedCandidate[] = [];
  const eligible: AiProviderProfile[] = [];

  // Pass 1 — the privacy veto. Ineligible providers leave the chain entirely;
  // they are not candidates for the first attempt OR for a later retry.
  for (const p of ordered) {
    const verdict = providerEligibleForSensitivity(p, sensitivity);
    if (verdict.eligible) {
      eligible.push(p);
    } else {
      skipped.push({ id: p.id, reason: verdict.reason });
    }
  }

  // Pass 2 — readiness, among those allowed to see the payload at all.
  for (let i = 0; i < eligible.length; i++) {
    const p = eligible[i];
    const state = byId.get(p.id);
    if (state?.health === "ready") {
      return {
        kind: "provider",
        selected: { id: p.id, costClass: p.costClass, locality: p.locality },
        skipped,
        // READY ONES ONLY. `remaining` exists so a failure can retry down the
        // chain, and a provider the caller never reported ready is not a retry
        // candidate — it is a provider that is already known not to work.
        // Handing it back would make the consumer call adapters that the very
        // same health observation had just excluded, which is how a chain ends
        // up "falling back" onto four providers nobody configured.
        remaining: eligible
          .slice(i + 1)
          .filter((r) => byId.get(r.id)?.health === "ready")
          .map((r) => ({
            id: r.id,
            costClass: r.costClass,
            locality: r.locality,
          })),
      };
    }
    skipped.push({ id: p.id, reason: healthReason(state) });
  }

  return {
    kind: "unavailable",
    reason:
      ordered.length === 0
        ? `no provider declares capability for task "${decision.taskType}"`
        : eligible.length === 0
          ? `no provider may receive ${sensitivity} data for task "${decision.taskType}"`
          : `every provider for task "${decision.taskType}" is unusable`,
    skipped,
  };
}

/** The sensitivity class the chain will enforce for a task — exported so the
 *  caller can name it in an audit record without re-deriving the mapping. */
export function chainSensitivityFor(task: AiTaskType): AiDataSensitivity {
  return sensitivityForTask(task);
}

/** True when the outcome means the caller must NOT present an AI answer. */
export function mustDegrade(outcome: ChainOutcome): boolean {
  return outcome.kind === "unavailable";
}

// ── Failure classification — what a failure MEANS for the rest of the chain ──

/**
 * Why a candidate did not produce a usable answer.
 *
 * The distinction that matters is not severity, it is ATTRIBUTION: did this
 * PROVIDER fail, or did the REQUEST fail? A provider-attributed failure says
 * nothing about the next provider, so advancing is free information. A
 * request-attributed failure will reproduce everywhere, and walking the whole
 * chain with it just pays four times for the same answer — and, when the
 * request carries a person, hands the same payload to four vendors to learn
 * nothing.
 */
export type ChainFailureClass =
  /** This provider is not set up (missing key / base URL / model). */
  | "CONFIGURATION"
  /** Reachable in principle, not answering now (connection refused, 5xx). */
  | "UNAVAILABLE"
  /** Exceeded the clamped timeout or the policy latency ceiling. */
  | "TIMEOUT"
  /** Quota or rate limit — the provider is healthy and declining. */
  | "RATE_LIMIT"
  /** The provider answered with an error of its own. */
  | "PROVIDER_ERROR"
  /** It answered, but the output was not the shape the schema requires. */
  | "INVALID_OUTPUT"
  /** Excluded by the sensitivity veto. Not a failure — a refusal. */
  | "PRIVACY_BLOCK"
  /** No provider declares this task at all. */
  | "UNSUPPORTED_CAPABILITY";

export type ChainAdvancePolicy =
  /** Provider-attributed: try the next candidate. */
  | "advance"
  /** Request-attributed: ONE better candidate may still help, no more. */
  | "advance_once"
  /** Nothing downstream can change the outcome. Degrade now. */
  | "stop";

/**
 * May the chain move on after this failure?
 *
 * `INVALID_OUTPUT` is the interesting row, and it is `advance_once` rather than
 * either extreme. A small local model that drifts off-schema is the single most
 * likely failure of the free-first ordering, and one escalation to a
 * structured-output provider genuinely fixes it — that is the whole reason
 * `structuredOutput` is on the profile. But if the SECOND provider also cannot
 * hold the shape, the prompt or the schema is what is wrong, and asking a third
 * and a fourth is just repetition. One retry mirrors the one-tier escalation
 * ceiling that task-routing already enforces for exactly the same reason.
 */
export function advancePolicyFor(
  failure: ChainFailureClass,
): ChainAdvancePolicy {
  switch (failure) {
    case "CONFIGURATION":
    case "UNAVAILABLE":
    case "TIMEOUT":
    case "RATE_LIMIT":
    case "PROVIDER_ERROR":
      return "advance";
    case "INVALID_OUTPUT":
      return "advance_once";
    case "PRIVACY_BLOCK":
    case "UNSUPPORTED_CAPABILITY":
      return "stop";
  }
}

/**
 * Map a completion result onto a failure class.
 *
 * `disabled` is deliberately CONFIGURATION rather than UNAVAILABLE: an adapter
 * returning the disabled sentinel is telling us the operator never set it up,
 * which is a different sentence from "it was set up and it is down", and the
 * two produce different operator actions.
 */
export function classifyCompletionFailure(result: {
  readonly status: string;
  readonly code?: string;
  readonly message?: string;
}): ChainFailureClass | null {
  if (result.status === "ok") return null;
  if (result.status === "disabled") return "CONFIGURATION";

  switch (result.code) {
    case "timeout":
      return "TIMEOUT";
    case "no_api_key":
      return "CONFIGURATION";
    case "malformed_output":
      return "INVALID_OUTPUT";
    case "unsupported":
      return "UNSUPPORTED_CAPABILITY";
    case "budget_exceeded":
      // Not a provider fault and not fixable by a different provider — the
      // ceiling belongs to the run, not to the vendor.
      return "RATE_LIMIT";
    case "provider_error":
    default: {
      // A 429 arrives as a provider_error with the status in the message; rate
      // limiting is worth separating because it is the one provider failure
      // that is expected to clear on its own.
      const m = result.message ?? "";
      if (/\b429\b|rate.?limit|quota/i.test(m)) return "RATE_LIMIT";
      if (/\b5\d{2}\b|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(m)) {
        return "UNAVAILABLE";
      }
      return "PROVIDER_ERROR";
    }
  }
}
