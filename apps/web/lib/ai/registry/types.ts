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

/** The twelve product agents (the 13th — audit/registry/eval — is infra). */
export type AiAgentKey =
  | "worker_profile"
  | "skill_evidence"
  | "work_journal"
  | "company_need"
  | "country_readiness"
  | "document_assistant"
  | "matching_explanation"
  | "booking_risk"
  | "admin_risk"
  | "translation_copy"
  | "support_onboarding"
  /** The first agent whose payload carries no data subject — aggregate
   *  public labour-market statistics. See agents/market-explanation.ts. */
  | "market_explanation";

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
