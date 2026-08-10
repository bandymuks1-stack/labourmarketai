/**
 * Data sensitivity classes — WHICH PROVIDER MAY SEE WHAT.
 *
 * The free-provider matrix (docs/ai/free-provider-matrix-2026-08-09.md) found
 * the thing that decides this module: **Google's Gemini free tier documents
 * that content IS used to improve their products; the paid tier documents that
 * it is not.** Generalised, that is a rule about a whole class of offer — when
 * a cloud service is free, the consideration is sometimes the data. For a
 * platform whose prompts carry CVs, work-journal entries and absence notes,
 * and which is the GDPR controller for them, "free" is then not a cost saving
 * on that content. It is a disclosure.
 *
 * So cost class alone must never decide routing. `provider-chain.ts` orders by
 * cost; THIS module holds the veto, and the veto runs first for the tasks that
 * carry a person. A free tier can be cheaper AND still be the wrong place.
 *
 * Note what is deliberately NOT claimed here: this is not a legal
 * determination. Whether any given free tier may lawfully process the personal
 * data of EU data subjects under a DPA is an owner decision with a lawyer in
 * it, and the matrix says so. This module encodes the engineering half — the
 * payload physically does not reach an ineligible provider — so that the legal
 * half is never load-bearing on its own.
 *
 * Pure. No IO, no env, no server-only, no SDK import.
 */
import type { AiTaskType } from "./task-routing";
import type { AiProviderProfile } from "./provider-chain";

/**
 * What the payload of a task carries.
 *
 * `PUBLIC`                 — reference data with no data subject in it at all
 *                            (an occupation taxonomy, a country's document
 *                            list). Disclosure is a non-event.
 * `LOW_RISK_PROJECT_DATA`  — a business's own operational text: scope of work,
 *                            headcount, timeframe. Commercially confidential,
 *                            but no natural person is described.
 * `PERSONAL`               — describes an identifiable person: a CV, a worker
 *                            profile, a journal entry, a match explanation
 *                            built from someone's evidence.
 * `SENSITIVE_FREE_TEXT`    — personal AND unbounded: the platform cannot know
 *                            what the human typed. An absence reason may be a
 *                            medical fact; a message may be anything. Treated
 *                            strictly above PERSONAL because minimisation
 *                            cannot be enforced on a field with no shape.
 */
export const AI_DATA_SENSITIVITY_CLASSES = [
  "PUBLIC",
  "LOW_RISK_PROJECT_DATA",
  "PERSONAL",
  "SENSITIVE_FREE_TEXT",
] as const;
export type AiDataSensitivity = (typeof AI_DATA_SENSITIVITY_CLASSES)[number];

/** Ordered least → most restricted. Used for comparisons, never for display. */
const SENSITIVITY_RANK: Record<AiDataSensitivity, number> = {
  PUBLIC: 0,
  LOW_RISK_PROJECT_DATA: 1,
  PERSONAL: 2,
  SENSITIVE_FREE_TEXT: 3,
};

/**
 * Sensitivity of each task, derived from the fields its policy actually admits
 * (`TASK_POLICIES[t].allowedFields` in task-routing.ts) — not from the task's
 * name and not from how it feels.
 *
 * NO TASK IS `PUBLIC` TODAY. That is a finding, not an omission: every task
 * this platform runs is about either a business's own work or a specific
 * person. The class exists because a future taxonomy/reference task is the
 * obvious candidate for it, and inventing a `PUBLIC` mapping now to make the
 * table look complete would be exactly the kind of claim this file exists to
 * prevent.
 */
export const TASK_SENSITIVITY: Record<AiTaskType, AiDataSensitivity> = {
  // Employer's own future work — scope, headcount, timeframe, region.
  structure_future_work: "LOW_RISK_PROJECT_DATA",
  // Structured scope + country → what working there requires. No data subject.
  derive_workforce_requirements: "LOW_RISK_PROJECT_DATA",
  // Reads `journal_entry_text`: a named worker's account of their own day.
  normalize_work_scope: "PERSONAL",
  // Deterministic tasks never reach a provider at all (the chain
  // short-circuits before selection). Classed truthfully anyway, so the table
  // stays correct if that ever changes.
  detect_capacity_gap: "LOW_RISK_PROJECT_DATA",
  detect_skill_gap: "LOW_RISK_PROJECT_DATA",
  // A person's external profile text and declared skills.
  normalize_external_profile: "PERSONAL",
  // The ONE task whose job is reading CV text.
  extract_cv: "PERSONAL",
  // Built from a specific worker's skills, evidence and availability.
  explain_match: "PERSONAL",
  // `source_text` is arbitrary human text — the platform cannot bound what a
  // person typed into a message before asking for it to be translated.
  translate_message: "SENSITIVE_FREE_TEXT",
  // Conversation summary + goal, written about and often by a named person.
  draft_follow_up: "PERSONAL",
};

export function sensitivityForTask(task: AiTaskType): AiDataSensitivity {
  return TASK_SENSITIVITY[task];
}

/** True for the classes that describe an identifiable person. */
export function carriesPersonalData(s: AiDataSensitivity): boolean {
  return SENSITIVITY_RANK[s] >= SENSITIVITY_RANK.PERSONAL;
}

export type SensitivityEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: string };

/**
 * May this provider receive a payload of this sensitivity?
 *
 * The rules, and why each one:
 *
 *   LOCAL is always eligible. The prompt never leaves a network the operator
 *   controls, so there is no disclosure to assess. This is what makes the
 *   free-local-first ordering safe rather than merely cheap.
 *
 *   A FREE CLOUD TIER may not receive PERSONAL or SENSITIVE_FREE_TEXT. This is
 *   the rule the matrix bought. It is deliberately a property of the CLASS, not
 *   a list of vendors: a provider is only ever placed in `free_tier` by an
 *   explicit edit, and that edit must not silently also grant it people's CVs.
 *   A vendor whose CURRENT terms genuinely permit this processing is not
 *   unblocked by arguing about it here — it is unblocked by verifying the terms
 *   and moving it out of `free_tier`, with the source, in the matrix.
 *
 *   PAID CLOUD is eligible. Not because money purifies anything, but because
 *   reaching it already required the owner to enable that provider under
 *   commercial terms — a decision with a human in it, recorded elsewhere.
 *
 * NOTE ON TODAY'S EFFECT: no provider in `AI_PROVIDER_PROFILES` is currently
 * classed `free_tier`, so this veto fires zero times in production right now.
 * That is precisely why its test injects a synthetic free-tier provider — a
 * rule with no live subject is otherwise indistinguishable from a rule that
 * does not work.
 */
export function providerEligibleForSensitivity(
  profile: Pick<AiProviderProfile, "id" | "costClass" | "locality">,
  sensitivity: AiDataSensitivity,
): SensitivityEligibility {
  if (profile.locality === "local") return { eligible: true };

  if (profile.costClass === "disabled") {
    return { eligible: false, reason: "provider is disabled" };
  }

  if (profile.costClass === "free_tier" && carriesPersonalData(sensitivity)) {
    return {
      eligible: false,
      reason: `free cloud tier may not receive ${sensitivity} data — a free tier's consideration can be the content itself (see docs/ai/free-provider-matrix-2026-08-09.md)`,
    };
  }

  return { eligible: true };
}
