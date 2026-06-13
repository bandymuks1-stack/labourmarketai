/**
 * Prompt registry — the single source of truth (Internal LLM Agents v1).
 *
 * Agents register here, not in components/routes (enforced by
 * prompt-registry-required). All ELEVEN product agents are registered.
 * `getPromptEntry` throws for an unregistered agent so a caller can never
 * silently run a promptless agent.
 */
import type { AiAgentKey, PromptRegistryEntry } from "./types";
import { workerProfileEntry } from "./agents/worker-profile";
import { workJournalEntry } from "./agents/work-journal";
import { skillEvidenceEntry } from "./agents/skill-evidence";
import { documentAssistantEntry } from "./agents/document-assistant";
import { companyNeedEntry } from "./agents/company-need";
import { countryReadinessEntry } from "./agents/country-readiness";
import { matchingExplanationEntry } from "./agents/matching-explanation";
import { bookingRiskEntry } from "./agents/booking-risk";
import { adminRiskEntry } from "./agents/admin-risk";
import { supportOnboardingEntry } from "./agents/support-onboarding";
import { translationCopyEntry } from "./agents/translation-copy";

export const AI_PROMPT_REGISTRY: Partial<
  Record<AiAgentKey, PromptRegistryEntry>
> = {
  worker_profile: workerProfileEntry,
  work_journal: workJournalEntry,
  skill_evidence: skillEvidenceEntry,
  document_assistant: documentAssistantEntry,
  company_need: companyNeedEntry,
  country_readiness: countryReadinessEntry,
  matching_explanation: matchingExplanationEntry,
  booking_risk: bookingRiskEntry,
  admin_risk: adminRiskEntry,
  support_onboarding: supportOnboardingEntry,
  translation_copy: translationCopyEntry,
};

/** Agent keys with a registered prompt today (all eleven). */
export const REGISTERED_AGENTS = Object.keys(
  AI_PROMPT_REGISTRY,
) as AiAgentKey[];

export function getPromptEntry(agent: AiAgentKey): PromptRegistryEntry {
  const entry = AI_PROMPT_REGISTRY[agent];
  if (!entry) {
    throw new Error(
      `No prompt registered for agent "${agent}". Register it in the prompt registry before use.`,
    );
  }
  return entry;
}

export function hasPromptEntry(agent: AiAgentKey): boolean {
  return Boolean(AI_PROMPT_REGISTRY[agent]);
}

/** The complete set of product agent keys (for guards / completeness checks). */
export const ALL_AGENT_KEYS: readonly AiAgentKey[] = [
  "worker_profile",
  "work_journal",
  "skill_evidence",
  "document_assistant",
  "company_need",
  "country_readiness",
  "matching_explanation",
  "booking_risk",
  "admin_risk",
  "support_onboarding",
  "translation_copy",
];
