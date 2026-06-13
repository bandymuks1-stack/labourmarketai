/**
 * Prompt registry — the single source of truth (Internal LLM Agents v1, PR3).
 *
 * Agents register here, not in components/routes (enforced by
 * prompt-registry-required). PR3 ships the framework + two fully-specified proof
 * agents (Worker Profile, Country Readiness); PR5–PR9 register the remaining
 * nine. `getPromptEntry` throws for an unregistered agent so a caller can never
 * silently run a promptless agent.
 */
import type { AiAgentKey, PromptRegistryEntry } from "./types";
import { workerProfileEntry } from "./agents/worker-profile";
import { countryReadinessEntry } from "./agents/country-readiness";
import { workJournalEntry } from "./agents/work-journal";
import { skillEvidenceEntry } from "./agents/skill-evidence";

export const AI_PROMPT_REGISTRY: Partial<
  Record<AiAgentKey, PromptRegistryEntry>
> = {
  worker_profile: workerProfileEntry,
  work_journal: workJournalEntry,
  skill_evidence: skillEvidenceEntry,
  country_readiness: countryReadinessEntry,
};

/** Agent keys with a registered prompt today. */
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
