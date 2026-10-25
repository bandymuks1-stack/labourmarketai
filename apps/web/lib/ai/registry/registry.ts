/**
 * Prompt registry — the single source of truth (Internal LLM Agents v1).
 *
 * Agents register here, not in components/routes (enforced by
 * prompt-registry-required). `getPromptEntry` throws for an unregistered agent
 * so a caller can never silently run a promptless agent.
 *
 * NINE agents are registered, and every one has a product call site
 * (`lib/guards/ai-agent-call-sites.test.ts` counts them).
 *
 * RETIRED 2026-10-25 by owner decision (registry row 10.11, "six registered AI
 * agents without a call site"): `admin_risk`, `booking_risk`,
 * `document_assistant`, `skill_evidence`, `support_onboarding`. Each one's
 * whole output was already answered by connected deterministic code, so a
 * call site would have been a second, competing answer. The per-capability
 * evidence is the decision table in docs/ai/INTERNAL_LLM_AGENTS_V1.md §4.1.
 * The sixth, `country_readiness`, was INTEGRATED instead: a labelled
 * plain-language reading over the sourced country matrix
 * (lib/country-readiness/readiness-reading-actions.ts).
 *
 * Re-registering a retired key is not forbidden — but it arrives with its call
 * site in the same change, or the call-site guard goes red.
 */
import type { AiAgentKey, PromptRegistryEntry } from "./types";
import { workerProfileEntry } from "./agents/worker-profile";
import { workJournalEntry } from "./agents/work-journal";
import { companyNeedEntry } from "./agents/company-need";
import { countryReadinessEntry } from "./agents/country-readiness";
import { matchingExplanationEntry } from "./agents/matching-explanation";
import { translationCopyEntry } from "./agents/translation-copy";
import { marketExplanationEntry } from "./agents/market-explanation";
import { conversationIntentEntry } from "./agents/conversation-intent";
import { vacancyTranslationEntry } from "./agents/vacancy-translation";

export const AI_PROMPT_REGISTRY: Partial<
  Record<AiAgentKey, PromptRegistryEntry>
> = {
  worker_profile: workerProfileEntry,
  work_journal: workJournalEntry,
  company_need: companyNeedEntry,
  country_readiness: countryReadinessEntry,
  matching_explanation: matchingExplanationEntry,
  translation_copy: translationCopyEntry,
  market_explanation: marketExplanationEntry,
  conversation_intent: conversationIntentEntry,
  vacancy_translation: vacancyTranslationEntry,
};

/** Agent keys with a registered prompt today (all nine). */
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
  "company_need",
  "country_readiness",
  "matching_explanation",
  "translation_copy",
  "market_explanation",
  "conversation_intent",
  "vacancy_translation",
];

/**
 * Agent keys RETIRED by owner decision 2026-10-25 (registry row 10.11). Kept
 * as data so the guards can assert they stay unregistered and unmapped, and so
 * the reason each one went is one hop away (docs/ai/INTERNAL_LLM_AGENTS_V1.md
 * §4.1). Not an `AiAgentKey`: the type no longer admits them.
 */
export const RETIRED_AGENT_KEYS = [
  "admin_risk",
  "booking_risk",
  "document_assistant",
  "skill_evidence",
  "support_onboarding",
] as const;
