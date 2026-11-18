/**
 * Prompt registry — types (Internal LLM Agents v1, PR3).
 *
 * The registry is the SINGLE SOURCE OF TRUTH for prompts. Prompts must not be
 * scattered across components/routes (enforced by prompt-registry-required).
 * Each entry carries its versioned system prompt, strict input + output schemas,
 * safety rules, allowed evidence sources, and explicitly blocked claims.
 *
 * Pure types. No IO.
 */
import type { z } from "zod";

/**
 * The product agents. Nine since 2026-10-25: `admin_risk`, `booking_risk`,
 * `document_assistant`, `skill_evidence` and `support_onboarding` were
 * RETIRED by owner decision (registry row 10.11) — each duplicated a
 * connected deterministic answer. See `RETIRED_AGENT_KEYS` in ./registry.ts
 * and docs/ai/INTERNAL_LLM_AGENTS_V1.md §4.1.
 */
export type AiAgentKey =
  | "worker_profile"
  | "work_journal"
  | "company_need"
  /** A labelled plain-language reading of the sourced country-readiness
   *  matrix for one country and one scope. See agents/country-readiness.ts. */
  | "country_readiness"
  | "matching_explanation"
  | "translation_copy"
  /** The first agent whose payload carries no data subject — aggregate
   *  public labour-market statistics. See agents/market-explanation.ts. */
  | "market_explanation"
  /** The second agent whose payload carries no data subject of this platform:
   *  the verbatim text of PUBLICLY published job advertisements, rendered in
   *  the reader's language. See agents/vacancy-translation.ts. */
  | "vacancy_translation"
  | "conversation_intent";

export interface PromptRegistryEntry {
  readonly agent: AiAgentKey;
  readonly version: string;
  readonly title: string;
  /** The system prompt (versioned, audited). */
  readonly system: string;
  /** Strict schema for the structured input the caller assembles. */
  readonly inputSchema: z.ZodTypeAny;
  /** Strict ENVELOPE schema the model output must satisfy (suggestion-only). */
  readonly outputSchema: z.ZodTypeAny;
  /** Human-readable binding safety rules (mirrored into the system prompt). */
  readonly safetyRules: readonly string[];
  /** Canonical sources this agent may cite in evidence_refs. */
  readonly allowedEvidenceSources: readonly string[];
  /** Claims this agent must never make (verified/legal-guarantee/score/…). */
  readonly blockedClaims: readonly string[];
  /** ISO date of last prompt change (audit). */
  readonly lastUpdated: string;
}
