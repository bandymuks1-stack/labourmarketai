/**
 * Evidence Report model v1 (PR #479).
 *
 * Pure organiser that turns the worker's OWN evidence data (skill tiers,
 * journal counts, confirmations) into honest report SECTIONS. No DB, no I/O.
 *
 * Honesty contract — the report ALWAYS separates the evidence ladder and never
 * inflates it:
 *   self_declared      → the worker's own statement
 *   work_supported     → backed by ≥1 real work-journal entry (evidence, not proof)
 *   manager_confirmed  → a responsible person confirmed it
 *   verified           → real registry/admin verification
 * No scores, no matching, no fake verification.
 */

export type EvidenceTier =
  | "self_declared"
  | "work_supported"
  | "manager_confirmed"
  | "verified";

export interface EvidenceReportInput {
  /** Catalogued skill counts by tier (real). */
  readonly tierCounts: Record<EvidenceTier, number>;
  /** Skills backed by ≥1 work-journal entry (labels). */
  readonly supportedSkills: readonly string[];
  /** Self-declared skills with NO journal support yet (labels). */
  readonly unsupportedSkills: readonly string[];
  /** Skills supported by entries but not yet confirmed by a person (labels). */
  readonly awaitingConfirmation: readonly string[];
  /** Real work-journal entry count. */
  readonly journalEntries: number;
  /** Real manager/person confirmations count. */
  readonly confirmations: number;
  /** Whether a company/work-need fit context exists for this user. */
  readonly hasWorkNeedContext: boolean;
}

export interface EvidenceReportSection {
  readonly key:
    | "profileEvidence"
    | "skillsSupported"
    | "workEntrySummary"
    | "missingEvidence"
    | "fitReadiness";
  /** real data present, or an honest empty/not-available state. */
  readonly state: "real" | "empty" | "not_available";
  /** Real counts only (never fabricated). */
  readonly metrics: Record<string, number>;
  /** Item labels relevant to the section (may be empty). */
  readonly items: string[];
}

export interface EvidenceReport {
  readonly totalSkills: number;
  readonly sections: EvidenceReportSection[];
}

export function buildEvidenceReport(i: EvidenceReportInput): EvidenceReport {
  const totalSkills =
    i.tierCounts.self_declared +
    i.tierCounts.work_supported +
    i.tierCounts.manager_confirmed +
    i.tierCounts.verified;

  const profileEvidence: EvidenceReportSection = {
    key: "profileEvidence",
    state: totalSkills > 0 ? "real" : "empty",
    metrics: {
      total: totalSkills,
      selfDeclared: i.tierCounts.self_declared,
      workSupported: i.tierCounts.work_supported,
      confirmed: i.tierCounts.manager_confirmed + i.tierCounts.verified,
    },
    items: [],
  };

  const skillsSupported: EvidenceReportSection = {
    key: "skillsSupported",
    state: i.supportedSkills.length > 0 ? "real" : "empty",
    metrics: { count: i.supportedSkills.length },
    items: [...i.supportedSkills],
  };

  const workEntrySummary: EvidenceReportSection = {
    key: "workEntrySummary",
    state: i.journalEntries > 0 ? "real" : "empty",
    metrics: { entries: i.journalEntries, confirmations: i.confirmations },
    items: [],
  };

  const missingEvidence: EvidenceReportSection = {
    key: "missingEvidence",
    state:
      i.unsupportedSkills.length > 0 || i.awaitingConfirmation.length > 0
        ? "real"
        : "empty",
    metrics: {
      needEvidence: i.unsupportedSkills.length,
      needConfirmation: i.awaitingConfirmation.length,
    },
    items: [...i.unsupportedSkills, ...i.awaitingConfirmation],
  };

  const fitReadiness: EvidenceReportSection = {
    key: "fitReadiness",
    // Honest: only "real" when a work-need context exists AND there is supported
    // evidence to reason about; otherwise not_available (never a fake fit score).
    state: i.hasWorkNeedContext && i.supportedSkills.length > 0 ? "real" : "not_available",
    metrics: { supported: i.supportedSkills.length },
    items: [],
  };

  return {
    totalSkills,
    sections: [
      profileEvidence,
      skillsSupported,
      workEntrySummary,
      missingEvidence,
      fitReadiness,
    ],
  };
}