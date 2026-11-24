/**
 * AI runtime — completion provider contract (Internal LLM Agents v1, PR2).
 *
 * This is the LOW-LEVEL seam every internal agent calls through. It carries a
 * system prompt + structured input + an optional JSON output schema, and
 * returns RAW model output (validated against the agent's strict zod schema by
 * the agent layer, PR3 — never trusted here). No method may persist, verify,
 * price, or send anything.
 *
 * Pure types plus one pure locale clamp (`aiLocaleFor`). No IO, no SDK import.
 */
import type {
  AiProviderKind,
  AiSecondaryProviderKind,
  AiDisabledReason,
} from "./config-core";
import { isActiveLocale, type ActiveLocale } from "@/lib/i18n/config";

/**
 * The language an AI request is answered in: EVERY routed UI locale.
 *
 * It used to be the closed union `"en" | "lt" | "ru"`, and every caller
 * clamped to it with a hand-written subset — so a Dutch, German or Polish
 * reader on a fully translated, routed UI got English AI output. The prompt
 * layer was never the limit (providers receive `Locale: <code>` and the
 * prompts are language-neutral); the type was. Derived from `activeLocales`,
 * so activating a locale needs no edit here.
 */
export type AiLocale = ActiveLocale;

/** Clamp a UI locale to an AI locale: the locale itself when routed, English
 *  otherwise (an unrouted code has no UI to answer into). Pure. */
export function aiLocaleFor(value: string | null | undefined): AiLocale {
  return isActiveLocale(value) ? value : "en";
}

/** Tier alias vocabulary mirrored from task-routing (kept literal here so this
 *  low-level module stays import-light). */
export type AiRequestModelAlias = "haiku" | "sonnet" | "opus";

export interface AiCompletionRequest {
  /** Agent identity — used for audit + deterministic mock routing. */
  readonly agentKey: string;
  /** Prompt-registry version (audit). */
  readonly promptVersion: string;
  /** System prompt (from the prompt registry, PR3). */
  readonly system: string;
  /** Structured, RLS-scoped input the caller assembled from canonical rows. */
  readonly input: unknown;
  /** JSON Schema the model output must conform to (structured output). */
  readonly jsonSchema?: Record<string, unknown>;
  readonly locale: AiLocale;
  /** Per-call output-token override (clamped by the runtime cost guard). */
  readonly maxOutputTokens?: number;
  /**
   * Per-request model override, resolved by the task-routing layer from a
   * tier ALIAS (task-routing.ts). Providers honor `request.model ?? cfg.model`.
   * Absent → the config default model.
   */
  readonly model?: string;
  /**
   * Tier ALIAS the routing layer resolved (alongside the concrete `model` id).
   * Env-gated non-anthropic adapters use it to pick their own candidate model
   * when the concrete id belongs to another provider.
   */
  readonly modelAlias?: AiRequestModelAlias;
  /**
   * Language-routing preference from the task policy (e.g. "deepl" for
   * translate_message). The dispatcher TRIES the preferred secondary provider
   * first and falls through honestly to the primary LLM tier when it is not
   * configured — never a silent fake.
   */
  readonly preferredProvider?: AiSecondaryProviderKind;
  /**
   * The language the INPUT is written in, when the caller knows it (never
   * guessed). Machine-translation providers need it; absent → they either use
   * auto-detection (when the engine offers it) or decline.
   */
  readonly sourceLanguage?: string;
  /**
   * Deterministic output for the MOCK provider only (tests/dev). The live
   * provider ignores it entirely — it can never inject a fabricated live result.
   */
  readonly mock?: unknown;
}

export interface AiUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export type AiErrorCode =
  | "timeout"
  | "provider_error"
  | "no_api_key"
  | "malformed_output"
  /** The model hit the output-token ceiling mid-answer. Distinct from
   *  `malformed_output` because retrying the SAME request on another provider
   *  reproduces it — the ceiling belongs to the request, not the vendor. */
  | "truncated"
  | "budget_exceeded"
  | "unsupported";

export type AiCompletionResult =
  | {
      readonly status: "ok";
      readonly provider: "mock" | AiProviderKind | AiSecondaryProviderKind;
      readonly model: string;
      /** RAW model output — UNVALIDATED. The agent layer validates via zod. */
      readonly raw: unknown;
      readonly usage?: AiUsage;
    }
  | {
      readonly status: "disabled";
      readonly reason: AiDisabledReason;
      readonly provider?: AiAttributedProvider;
    }
  | {
      readonly status: "error";
      readonly code: AiErrorCode;
      readonly message: string;
      readonly provider?: AiAttributedProvider;
    };

/**
 * Which adapter produced a non-ok result, when the chain knows.
 *
 * Absent on the legacy single-provider path, where the failing provider is
 * `cfg.provider` by construction. Present on the chain path, where it is the
 * only way the audit trail can avoid blaming the primary provider for a
 * failure that happened three candidates later.
 *
 * WIDENED 2026-08-19 alongside `AiChainProviderId`: attribution must be able to
 * name a provider the registry knows but this union predates. A failure that
 * cannot be attributed is worse than one attributed to an id the type did not
 * anticipate — the known members stay listed as documentation of the common
 * cases.
 */
export type AiAttributedProvider = "mock" | AiProviderKind | AiSecondaryProviderKind | string;

export function isAiOk(
  r: AiCompletionResult,
): r is Extract<AiCompletionResult, { status: "ok" }> {
  return r.status === "ok";
}

/** A provider for a single completion. Implementations: disabled / mock / live. */
export interface AiCompletionProvider {
  readonly kind: "disabled" | "mock" | AiProviderKind | AiSecondaryProviderKind;
  complete(
    request: AiCompletionRequest,
    cfg: import("./config-core").AiRuntimeConfig,
  ): Promise<AiCompletionResult>;
}
