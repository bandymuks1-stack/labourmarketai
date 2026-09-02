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
import { egressPermitted, type AiEgressGrant } from "./data-egress";

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
 * EXACTLY ONE TASK IS `PUBLIC` (2026-08-24). For the whole life of this file
 * until then, none was — recorded here as a finding rather than an omission,
 * because every task this platform ran was about either a business's own work
 * or a specific person, and inventing a `PUBLIC` mapping to make the table
 * look complete would have been exactly the claim this file exists to prevent.
 *
 * `explain_market_demand` is the reference task the note anticipated. It is
 * `PUBLIC` on the evidence of its own policy: `TASK_POLICIES` admits eleven
 * fields, every one of them an aggregate count, a taxonomy slug, a place name
 * or a date, derived from externally published job advertisements. Employer
 * identity, advertisement text, application URLs and coordinates are all in
 * its `prohibitedFields`, and the module that assembles the payload
 * (`lib/market/public-market-facts.ts`) never selects them from the database
 * in the first place.
 *
 * WHAT THIS DOES AND DOES NOT CHANGE. It does not touch `AI_EGRESS_GRANTS`,
 * which stays empty; it does not raise any provider's ceiling; and it moves no
 * existing task. An ungranted external provider may already receive `PUBLIC`,
 * so this one classification is the entire mechanism by which the first real
 * external run becomes possible — and CV extraction, journal normalisation,
 * match explanation, follow-up drafting and translation stay refused by the
 * identical rule they were refused by yesterday.
 *
 * A SECOND `PUBLIC` TASK IS NOT ROUTINE. Adding one means making this same
 * argument again, field by field, against that task's own policy. The guard
 * `lib/guards/ai-wired-surface-sensitivity.test.ts` holds the allowlist so
 * that a new `PUBLIC` entry is a red test until someone writes the reasoning.
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
  // Aggregate counts of published job advertisements for ONE occupation.
  // Nobody is described; nothing is re-joinable to a row. See the note above.
  explain_market_demand: "PUBLIC",
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
 * DELEGATED 2026-08-19 to `./data-egress.ts` under the owner's AI DATA BOUNDARY
 * decision. This function keeps its name and shape — the chain calls it in its
 * first pass and nothing about that changes — but the RULE it applies moved,
 * because the old rule sorted on the wrong axis.
 *
 * It used to say: a FREE cloud tier may not receive personal data, and a PAID
 * cloud provider may, "because reaching it already required the owner to enable
 * that provider under commercial terms". That treated an ENABLEMENT decision as
 * if it were a DATA-TRANSFER decision. They are different acts: paying a vendor
 * is not the same as permitting it to process a worker's journal entry. Under
 * the owner's decision the axis is INTERNAL vs EXTERNAL and permission is
 * explicit and default-deny — €0 never grants permission to send data, and
 * neither does a paid invoice.
 *
 * The free-tier rule is not lost: it survives as `MAX_GRANTABLE_FOR_FREE_TIER`,
 * a ceiling a grant cannot exceed.
 */
export function providerEligibleForSensitivity(
  profile: Pick<AiProviderProfile, "id" | "costClass" | "locality">,
  sensitivity: AiDataSensitivity,
  grants?: readonly AiEgressGrant[],
): SensitivityEligibility {
  if (profile.costClass === "disabled") {
    return { eligible: false, reason: "provider is disabled" };
  }
  const verdict = egressPermitted(profile, sensitivity, grants);
  return verdict.permitted
    ? { eligible: true }
    : { eligible: false, reason: verdict.reason };
}
