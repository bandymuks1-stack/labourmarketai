/**
 * LEGACY AI assist boundary — typed skeleton. NOT the canonical runtime.
 *
 * AI Runtime Consolidation Plan v1 Phase 2 marking. This module belongs to the
 * LEGACY assist island (plan §1.3): `lib/config/ai.ts` + `./provider.ts` +
 * `./noop-provider.ts` + `./estimate-clarify-actions.ts` +
 * `./legacy-assist-schemas.ts` + `components/app/estimate-clarify-assist.tsx`.
 * The island is permanently inert — `AI_ASSIST_ENABLED` is a source literal
 * `false` that no environment variable can flip, and `getAiProvider()` has no
 * live branch to return.
 *
 * CANONICAL REPLACEMENTS — use these in new code:
 *   provider adapter contract  →  `lib/ai/runtime/types.ts` (`AiCompletionProvider`)
 *   runtime configuration      →  `lib/ai/runtime/config-core.ts` (`AiRuntimeConfig`)
 *   model candidates           →  `lib/ai/runtime/model-candidates.ts`
 *   agent output contract      →  `lib/ai/schemas/envelope.ts`
 *   entrypoint                 →  `runAiAgent()` in `lib/ai/run-agent-server.ts`
 *
 * ZERO symbols are shared with the runtime (plan §1.2, enforced by
 * `lib/guards/ai-runtime-boundary.test.ts`). `AiLocale` is declared here AND in
 * `lib/ai/runtime/types.ts` DELIBERATELY: two identical, independent
 * declarations keep the boundary import-free. Do not "de-duplicate" them by
 * importing across the boundary — that would re-create the coupling Phase 1
 * removed.
 *
 * ── original header ──
 * AI assistance layer — typed boundary (readiness skeleton).
 *
 * TYPES + CONFIG CONSTANTS ONLY. There is NO runtime model integration, NO SDK,
 * NO network call, and NO API key anywhere in this layer. The default provider
 * is the deterministic, inert {@link ./noop-provider}. Nothing here activates
 * AI — activation is owner-gated behind `AI_ASSIST_ENABLED` (lib/config/ai.ts),
 * which is `false` and stays `false` until the owner decides provider, budget
 * and key handling.
 *
 * Architecture + binding rules: docs/ai/AI_READINESS.md + docs/audits/ai-readiness.md,
 * grounded in PLATFORM_DOCTRINE §7 (AI-never-lies) and §7.1 (AI as translator,
 * not author). Every AI output is a SUGGESTION (structured data, never prose of
 * record) and only becomes a record through an existing human-confirmed write
 * path — AI never persists, never verifies, never produces a final estimate or
 * binding quote, never invents prices/clients/matches.
 *
 * Pure types/constants. No IO.
 */

/** Provider identities — config CANDIDATES, never an active selection here.
 *  The default is always `noop` while AI is disabled. */
export type AiProviderId = "noop" | "anthropic" | "openai";

/** The default provider id — inert/deterministic. */
export const DEFAULT_AI_PROVIDER_ID: AiProviderId = "noop";

/**
 * Model id candidates MOVED — AI Runtime Consolidation Plan v1, Phase 1.
 *
 * `AI_MODEL_CANDIDATES` now lives in `lib/ai/runtime/model-candidates.ts`, the
 * canonical runtime. It was the ONLY symbol shared between the runtime and this
 * legacy assist boundary; moving it means zero symbols now cross, and
 * `lib/guards/ai-task-routing.test.ts` allowlists `lib/ai/runtime/` alone.
 *
 * Nothing here re-exports it. A module that needs a model id belongs inside the
 * routing layer, and the guard enforces exactly that.
 */


/** The use cases this boundary is shaped for (all inactive). */
export type AiAssistKind =
  | "demand_draft"
  | "estimate_clarify"
  | "worker_profile_draft";

/** Locale of the assist (active product locales). */
export type AiLocale = "en" | "lt" | "ru";

// ── Inputs (read-only context the caller would pass) ───────────────────────

export interface DemandDraftAssistInput {
  readonly kind: "demand_draft";
  readonly locale: AiLocale;
  /** The role/work the company is hiring for (free text). */
  readonly roleHint?: string;
  /** A rough description the user already typed, to clarify/polish. */
  readonly rawDescription?: string;
}

export interface EstimateClarifyInput {
  readonly kind: "estimate_clarify";
  readonly locale: AiLocale;
  /** Missing-info KEYS produced by the DETERMINISTIC estimate engine. The AI
   *  may only turn these into clarifying questions — never into numbers. */
  readonly missingInfoKeys: readonly string[];
  /** Free-text work description for context (never figures). */
  readonly workContext?: string;
}

export interface WorkerProfileDraftInput {
  readonly kind: "worker_profile_draft";
  readonly locale: AiLocale;
  /** The worker's own rough wording to polish (never new claims). */
  readonly rawText?: string;
}

export type AiAssistInput =
  | DemandDraftAssistInput
  | EstimateClarifyInput
  | WorkerProfileDraftInput;

// ── Results — ALWAYS suggestion-tagged structured data, never prose of record ─

/** Every successful AI result carries `suggestion: true` and contains only the
 *  drafting/clarifying fields below — NEVER a price, total, score, verification
 *  status, or any field that could be mistaken for a record/fact. */

export interface DemandDraftAssistResult {
  readonly kind: "demand_draft";
  readonly suggestion: true;
  /** A polished DRAFT description (null when nothing to suggest). */
  readonly draftDescription: string | null;
  /** Clarifying questions to help the user describe the need better. */
  readonly clarifyingQuestions: readonly string[];
  /** Short non-binding notes. */
  readonly notes: readonly string[];
}

export interface EstimateClarifyResult {
  readonly kind: "estimate_clarify";
  readonly suggestion: true;
  /** Questions that would improve the DETERMINISTIC estimate's accuracy. */
  readonly questions: readonly string[];
  /** Plain-language assumption phrasings (NO numbers — the engine owns those). */
  readonly assumptionNotes: readonly string[];
}

export interface WorkerProfileDraftResult {
  readonly kind: "worker_profile_draft";
  readonly suggestion: true;
  /** A polished DRAFT of the worker's own text (null when nothing to suggest). */
  readonly draftText: string | null;
  readonly notes: readonly string[];
}

export type AiAssistSuggestion =
  | DemandDraftAssistResult
  | EstimateClarifyResult
  | WorkerProfileDraftResult;

/** Returned whenever AI is disabled (the default everywhere today). Inert. */
export interface AiDisabledResult {
  readonly status: "disabled";
  readonly provider: AiProviderId;
  readonly reason: "ai_assist_disabled";
}

/** A provider call returns EITHER a suggestion OR the disabled sentinel. */
export type AiAssistResult = AiAssistSuggestion | AiDisabledResult;

export function isAiDisabled(r: AiAssistResult): r is AiDisabledResult {
  return (r as AiDisabledResult).status === "disabled";
}

/**
 * The provider boundary. A real provider would implement these by validating
 * its model output against the schemas in ./schemas (suggestion-only). The
 * DEFAULT implementation ({@link ./noop-provider}) returns `AiDisabledResult`
 * from every method and touches no network. No method may persist, verify,
 * price, or send anything.
 */
export interface AiProvider {
  readonly id: AiProviderId;
  /** Always false in this skeleton. */
  readonly enabled: boolean;
  assistDemandDraft(
    input: DemandDraftAssistInput,
  ): Promise<DemandDraftAssistResult | AiDisabledResult>;
  assistEstimateClarify(
    input: EstimateClarifyInput,
  ): Promise<EstimateClarifyResult | AiDisabledResult>;
  assistWorkerProfileDraft(
    input: WorkerProfileDraftInput,
  ): Promise<WorkerProfileDraftResult | AiDisabledResult>;
}
