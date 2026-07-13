/**
 * AI runtime — completion provider contract (Internal LLM Agents v1, PR2).
 *
 * This is the LOW-LEVEL seam every internal agent calls through. It carries a
 * system prompt + structured input + an optional JSON output schema, and
 * returns RAW model output (validated against the agent's strict zod schema by
 * the agent layer, PR3 — never trusted here). No method may persist, verify,
 * price, or send anything.
 *
 * Pure types. No IO, no SDK import.
 */
import type { AiProviderKind, AiDisabledReason } from "./config-core";

export type AiLocale = "en" | "lt" | "ru";

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
  | "budget_exceeded"
  | "unsupported";

export type AiCompletionResult =
  | {
      readonly status: "ok";
      readonly provider: "mock" | AiProviderKind;
      readonly model: string;
      /** RAW model output — UNVALIDATED. The agent layer validates via zod. */
      readonly raw: unknown;
      readonly usage?: AiUsage;
    }
  | { readonly status: "disabled"; readonly reason: AiDisabledReason }
  | { readonly status: "error"; readonly code: AiErrorCode; readonly message: string };

export function isAiOk(
  r: AiCompletionResult,
): r is Extract<AiCompletionResult, { status: "ok" }> {
  return r.status === "ok";
}

/** A provider for a single completion. Implementations: disabled / mock / live. */
export interface AiCompletionProvider {
  readonly kind: "disabled" | "mock" | AiProviderKind;
  complete(
    request: AiCompletionRequest,
    cfg: import("./config-core").AiRuntimeConfig,
  ): Promise<AiCompletionResult>;
}
