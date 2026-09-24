/**
 * AI runtime config — SERVER wrapper (Internal LLM Agents v1, PR2).
 *
 * Feeds the validated env (lib/env.ts) into the pure resolver. Server-only so
 * env secrets never reach a client bundle; the pure core (config-core.ts) is
 * what tests and guards import.
 *
 * This file is also the ONE place the whole provider chain's env is read. The
 * chain and its health model are pure by design — they take an observation
 * object — so this wrapper is where "what the operator configured" becomes
 * data. Keeping that read in a single server module is what lets every
 * ordering, fallback and privacy test run with no environment at all.
 */
import "server-only";
import { checkOutboundIntegrationUrl } from "@/lib/config/outbound-host-policy";
import { env } from "@/lib/env";
import {
  checkLocalBaseUrl,
  resolveAiRuntimeConfig,
  type AiRuntimeConfig,
} from "./config-core";
import type { AiProviderState } from "./provider-chain";
import {
  observeProviderStates,
  type ProviderObservation,
} from "./provider-health";

/**
 * The request context an entry point can hand down: the request's own Host
 * header, the second production evidence for the host policy (2026-09-24).
 * Omitted where there is no request (a script, a build step) — `VERCEL_ENV`
 * alone then decides, as before.
 */
export type AiRuntimeReadContext = {
  readonly requestHost?: string | null;
};

/**
 * AI_LOCAL_BASE_URL after the PRODUCTION host policy (2026-09-23). The local
 * profile is first in the chain and the only one allowed sensitive free text,
 * so an https tunnel to a PC would have become the first provider tried in
 * production — and every call would fall through while that PC was off. On
 * the production deployment a loopback / private / tunnel host is refused
 * here and the provider is simply unconfigured; the observation carries the
 * refusal as its detail so the operator sees why, not "not set".
 */
function localBaseUrlInput(ctx?: AiRuntimeReadContext): {
  raw: string | undefined;
  refusedDetail: string | undefined;
} {
  if (!env.AI_LOCAL_BASE_URL) return { raw: undefined, refusedDetail: undefined };
  const policy = checkOutboundIntegrationUrl(env.AI_LOCAL_BASE_URL, {
    integration: "AI_LOCAL_BASE_URL",
    requestHost: ctx?.requestHost,
  });
  if (policy.ok) return { raw: policy.url, refusedDetail: undefined };
  return {
    raw: undefined,
    refusedDetail: policy.reason === "refused_host" ? policy.detail : undefined,
  };
}

/** The key that proves the SELECTED primary provider is usable: the
 *  provider-specific key when set, else the generic AI_API_KEY (which the
 *  anthropic adapter reads). Presence-only — the value never leaves env.
 *
 *  `local` is absent from this switch ON PURPOSE. It has no key to prove, and
 *  falling through to AI_API_KEY would have quietly made an unrelated cloud
 *  key stand in as the local runtime's credential. */
function apiKeyForProvider(provider: string): string | undefined {
  switch (provider) {
    case "local":
      return undefined;
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

export function getAiRuntimeConfig(ctx?: AiRuntimeReadContext): AiRuntimeConfig {
  return resolveAiRuntimeConfig({
    mode: env.AI_PROVIDER_MODE,
    provider: env.AI_PROVIDER,
    apiKey: apiKeyForProvider(env.AI_PROVIDER),
    model: env.AI_MODEL,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    dailyRunBudget: env.AI_DAILY_RUN_BUDGET,
    localBaseUrl: localBaseUrlInput(ctx).raw,
    localModel: env.AI_LOCAL_MODEL,
    localApiKey: env.AI_LOCAL_API_KEY,
  });
}

/**
 * What the operator actually configured, per provider.
 *
 * Note this reports EVERY provider, not just `AI_PROVIDER`. That is the point:
 * the chain's whole job is to have a successor, and a model that could only
 * ever see the one selected provider would have nothing to fall back to. Key
 * PRESENCE only — no value is read into the returned object.
 */
export function getProviderObservation(ctx?: AiRuntimeReadContext): ProviderObservation {
  const cfg = getAiRuntimeConfig(ctx);
  const { raw: localRaw, refusedDetail } = localBaseUrlInput(ctx);
  const localCheck = checkLocalBaseUrl(localRaw);
  return {
    runtimeState: cfg.state,
    local: {
      enabled: env.AI_LOCAL_ENABLED === "true",
      baseUrl: localCheck.ok ? localCheck.url : null,
      model: cfg.localModel,
      baseUrlDetail: localCheck.ok ? undefined : (refusedDetail ?? localCheck.detail),
    },
    // Anthropic is the historically-active adapter and has no per-provider
    // enable flag of its own; AI_API_KEY has always been its whole gate.
    anthropic: { enabled: true, hasKey: Boolean(env.AI_API_KEY?.trim()) },
    openai: {
      enabled: env.AI_OPENAI_ENABLED === "true",
      hasKey: Boolean((env.OPENAI_API_KEY ?? env.AI_API_KEY)?.trim()),
    },
    gemini: {
      enabled: env.AI_GEMINI_ENABLED === "true",
      hasKey: Boolean((env.GEMINI_API_KEY ?? env.AI_API_KEY)?.trim()),
    },
    xai: {
      enabled: env.AI_XAI_ENABLED === "true",
      hasKey: Boolean((env.XAI_API_KEY ?? env.AI_API_KEY)?.trim()),
    },
  };
}

/** Observed readiness of every chain provider, from real configuration. */
export function getAiProviderStates(ctx?: AiRuntimeReadContext): readonly AiProviderState[] {
  return observeProviderStates(getProviderObservation(ctx));
}
