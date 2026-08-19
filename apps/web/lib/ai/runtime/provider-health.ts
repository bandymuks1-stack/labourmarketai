/**
 * Provider health observation — PURE.
 *
 * `provider-chain.ts` orders candidates but deliberately does not decide which
 * of them is usable; it takes health from the caller. This module is that
 * caller's other half: it turns "what the operator configured" into the
 * `AiProviderState[]` the chain consumes, without reading env itself.
 *
 * The env read happens once, at the server boundary (`runtime/config.ts`), and
 * arrives here as a plain record. That split is what lets every ordering,
 * fallback and privacy test run with no environment at all — the states a test
 * wants to reproduce are just an object literal.
 *
 * WHAT "ready" MEANS HERE, precisely: configured well enough to be worth
 * ATTEMPTING. It is not a liveness probe — nothing in this file makes a network
 * call, and a local runtime that is configured but switched off still reports
 * `ready`. It fails on the attempt instead, the failure classifies as
 * UNAVAILABLE, and the chain advances. Probing first would double the latency
 * of every run to pre-empt a case the failure path already handles correctly.
 *
 * Pure. No IO, no env, no server-only, no SDK import.
 */
import type { AiChainProviderId, AiProviderState } from "./provider-chain";

/** What the operator set up for one CLOUD provider. */
export interface CloudProviderObservation {
  /** Its per-provider enable flag (AI_<P>_ENABLED). */
  readonly enabled: boolean;
  /** Key PRESENCE only — no value ever reaches this module. */
  readonly hasKey: boolean;
}

/** What the operator set up for the local runtime. */
export interface LocalProviderObservation {
  /** AI_LOCAL_ENABLED. */
  readonly enabled: boolean;
  /** Already VALIDATED by config-core.checkLocalBaseUrl — null if it failed. */
  readonly baseUrl: string | null;
  readonly model: string | null;
  /** Why the base URL was rejected, when it was. Carries no credential. */
  readonly baseUrlDetail?: string;
}

export interface ProviderObservation {
  /** The runtime is only live at all in this state. */
  readonly runtimeState: "disabled" | "mock" | "live";
  readonly local: LocalProviderObservation;
  readonly anthropic: CloudProviderObservation;
  readonly openai: CloudProviderObservation;
  readonly gemini: CloudProviderObservation;
  readonly xai: CloudProviderObservation;
  /**
   * ANY other cloud provider, keyed by registry id. The open extension point:
   * the four named fields above predate the model registry, and a provider
   * that cannot be OBSERVED can never be reported ready, so opening dispatch
   * without opening observation would have left a newly registered provider
   * dispatchable in theory and unreachable in fact.
   *
   * Named fields are kept rather than replaced so existing callers are
   * untouched; a key here that duplicates one of them is ignored in favour of
   * the named field, so there is exactly one answer per provider.
   */
  readonly cloud?: Readonly<Record<string, CloudProviderObservation>>;
}

function cloudState(
  id: AiChainProviderId,
  o: CloudProviderObservation,
): AiProviderState {
  if (!o.enabled) {
    return {
      id,
      health: "disabled",
      reason: `AI_${id.toUpperCase()}_ENABLED is not true`,
    };
  }
  if (!o.hasKey) {
    return { id, health: "unconfigured", reason: "no API key is set" };
  }
  return { id, health: "ready" };
}

function localState(o: LocalProviderObservation): AiProviderState {
  if (!o.enabled) {
    return {
      id: "local",
      health: "disabled",
      reason: "AI_LOCAL_ENABLED is not true",
    };
  }
  if (!o.baseUrl) {
    return {
      id: "local",
      health: "unconfigured",
      reason: o.baseUrlDetail ?? "AI_LOCAL_BASE_URL is not set or was rejected",
    };
  }
  if (!o.model) {
    return {
      id: "local",
      health: "unconfigured",
      reason: "AI_LOCAL_MODEL is not set",
    };
  }
  // Configured. Whether the machine is switched on is settled by the attempt.
  return { id: "local", health: "ready" };
}

/**
 * The observed state of every provider the chain can order.
 *
 * When the runtime is not `live` NOTHING is ready — mock and disabled are whole
 * -runtime states, and a chain that selected a real provider underneath them
 * would defeat the point of having them.
 */
export function observeProviderStates(
  o: ProviderObservation,
): readonly AiProviderState[] {
  const NAMED = ["local", "anthropic", "openai", "gemini", "xai"] as const;
  const extraIds = Object.keys(o.cloud ?? {}).filter(
    (id) => !NAMED.includes(id as (typeof NAMED)[number]),
  );

  if (o.runtimeState !== "live") {
    const reason = `AI runtime is "${o.runtimeState}", not live`;
    return [...NAMED, ...extraIds].map((id) => ({
      id,
      health: "disabled" as const,
      reason,
    }));
  }
  return [
    localState(o.local),
    cloudState("anthropic", o.anthropic),
    cloudState("openai", o.openai),
    cloudState("gemini", o.gemini),
    cloudState("xai", o.xai),
    ...extraIds.map((id) => cloudState(id, o.cloud![id])),
  ];
}
