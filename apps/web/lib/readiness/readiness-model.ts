/**
 * READINESS vs FIT - pure requirement-readiness model (decision 0021,
 * "documents are readiness requirements + verification state, not a vault").
 *
 * Professional FIT answers "can this person do this work" (match-v1). READINESS
 * answers "what must still be checked, and by which stage, before the work can
 * lawfully start". They are two separate facts and this module NEVER feeds the
 * first: readiness is a sibling block, it has no input into status, score,
 * eligibility, ranking or visibility.
 *
 * No upload gate: nothing here reads whether a file exists. The only inputs
 * are a requirement SET (derived from jurisdiction / engagement / role /
 * project data that already exists - never a universal list) and, when the
 * reader may see them, the person's own requirement records (status, expiry,
 * who checked and when). "checked" means a named person looked at the evidence
 * and recorded the outcome; it does NOT mean LabourMarket holds a copy and it
 * does NOT mean independent verification.
 *
 * Honesty rule (SEP-7): a requirement we cannot enumerate or cannot read is
 * `unknown`, never `missing`. `missing` is reserved for a requirement that is
 * known, applies, has reached its stage, and has nothing recorded against it.
 *
 * Pure: no IO, no clock (caller passes `now`), no copy (codes only).
 */

/** The lightweight states of decision 0021 (+ `unknown`, the honest extra). */
export type ReadinessState =
  | "not_required"
  | "required"
  | "declared_available"
  | "needs_check"
  | "checked"
  | "missing"
  | "expiring"
  | "expired"
  | "unknown";

export const READINESS_STATES: readonly ReadinessState[] = [
  "not_required",
  "required",
  "declared_available",
  "needs_check",
  "checked",
  "missing",
  "expiring",
  "expired",
  "unknown",
];

/** Lifecycle stages, earliest first. Registration, matching, discovery,
 *  shortlist, planning, team formation and offers are deliberately NOT stages
 *  a requirement can gate - they sit before `contract`. */
export const READINESS_STAGES = ["contract", "assignment", "mobilisation", "work_start"] as const;
export type ReadinessStage = (typeof READINESS_STAGES)[number];

export type ReadinessLevel = "required" | "recommended" | "conditional";

/** Where the requirement itself comes from. */
export type ReadinessProvenance = "country_matrix" | "project_checklist" | "employer_demand" | "role";

export interface ReadinessRequirement {
  /** requirement type: a document_types slug or a matrix requirement key. */
  readonly requirementType: string;
  readonly level: ReadinessLevel;
  /** The stage at which the requirement genuinely applies. */
  readonly stage: ReadinessStage;
  /** Context the requirement was derived for (jurisdiction / scope / project). */
  readonly context: {
    readonly country: string | null;
    readonly scope: string | null;
    readonly projectId?: string | null;
  };
  readonly provenance: ReadinessProvenance;
  /** The authority page that backs the requirement, when the matrix has one. */
  readonly sourceUrl?: string | null;
  /** The platform cannot machine-check this requirement (no record type). */
  readonly notMachineCheckable?: boolean;
}

/** The person's own record against a requirement type. Never a file. */
export interface ReadinessRecord {
  readonly requirementType: string;
  /** Country the record was issued for / by, when it matters. */
  readonly issuerCountry?: string | null;
  readonly storedStatus: "missing" | "ready" | "blocked";
  readonly validUntil: string | null;
  readonly verification?: "unverified" | "pending" | "verified" | "rejected";
  readonly checkedBy?: string | null;
  readonly checkedAt?: string | null;
}

export interface ReadinessItem {
  readonly requirementType: string;
  readonly state: ReadinessState;
  readonly level: ReadinessLevel;
  readonly stage: ReadinessStage;
  readonly context: ReadinessRequirement["context"];
  readonly provenance: ReadinessProvenance;
  readonly sourceUrl: string | null;
  /** Minimum metadata (decision 0021). Null when no record is readable. */
  readonly expiry: string | null;
  readonly checkedBy: string | null;
  readonly checkedAt: string | null;
  readonly issuerCountry: string | null;
  /** True when a record (declaration / check) backs the state. Not a file. */
  readonly recorded: boolean;
}

/** `clear` all applicable checks done; `checks_outstanding`; `unknown` the
 *  requirement set itself is not known for this context. */
export type ReadinessSummaryStatus = "clear" | "checks_outstanding" | "unknown";

export interface ReadinessSummary {
  readonly status: ReadinessSummaryStatus;
  /** Applicable requirements that still need an action (see OUTSTANDING). */
  readonly outstanding: number;
  readonly unknownCount: number;
  /** Earliest stage by which something outstanding must be done. */
  readonly nextStage: ReadinessStage | null;
  readonly items: readonly ReadinessItem[];
  /** false: nothing was readable about the person, states are requirement-only. */
  readonly personRecordsRead: boolean;
}

/** States that still need a check/action before the requirement's stage. */
const OUTSTANDING: ReadonlySet<ReadinessState> = new Set<ReadinessState>([
  "required",
  "declared_available",
  "needs_check",
  "missing",
  "expiring",
  "expired",
]);

export const EXPIRING_WINDOW_DAYS = 30;

const stageRank = (s: ReadinessStage): number => READINESS_STAGES.indexOf(s);

function expiryState(validUntil: string | null, now: Date): "expired" | "expiring" | "valid" {
  if (!validUntil) return "valid";
  const until = new Date(`${validUntil}T23:59:59Z`).getTime();
  if (Number.isNaN(until)) return "valid";
  if (until < now.getTime()) return "expired";
  if (until - now.getTime() < EXPIRING_WINDOW_DAYS * 86_400_000) return "expiring";
  return "valid";
}

export function deriveItemState(args: {
  readonly requirement: ReadinessRequirement;
  readonly record: ReadinessRecord | null;
  /** Whether the person's records could be read at all by this viewer. */
  readonly recordsReadable: boolean;
  readonly now: Date;
  /** The stage the engagement is at now; null = pre-contract (discovery etc). */
  readonly currentStage: ReadinessStage | null;
}): ReadinessState {
  const { requirement: r, record, recordsReadable, now, currentStage } = args;
  if (r.notMachineCheckable) return "unknown";
  if (r.level === "conditional" && !record) return "unknown";
  if (!record) {
    if (r.level === "recommended") return "not_required";
    // Nothing recorded. Absent is only "missing" once the stage has been
    // reached AND the viewer could actually read the person's records.
    const reached = currentStage !== null && stageRank(currentStage) >= stageRank(r.stage);
    return reached && recordsReadable ? "missing" : "required";
  }
  if (record.storedStatus === "blocked" || record.storedStatus === "missing") return "missing";
  if (record.verification === "rejected") return "missing";
  const exp = expiryState(record.validUntil, now);
  if (exp === "expired") return "expired";
  if (exp === "expiring") return "expiring";
  if (record.verification === "verified") return "checked";
  if (record.verification === "pending") return "needs_check";
  return "declared_available";
}

export function deriveReadiness(input: {
  /** null = the requirement set for this context is not known. */
  readonly requirements: readonly ReadinessRequirement[] | null;
  readonly records: readonly ReadinessRecord[];
  readonly recordsReadable: boolean;
  readonly now: Date;
  readonly currentStage?: ReadinessStage | null;
}): ReadinessSummary {
  if (input.requirements === null || input.requirements.length === 0) {
    return {
      status: "unknown",
      outstanding: 0,
      unknownCount: 0,
      nextStage: null,
      items: [],
      personRecordsRead: input.recordsReadable,
    };
  }
  const currentStage = input.currentStage ?? null;
  const items: ReadinessItem[] = input.requirements.map((requirement) => {
    const record = input.recordsReadable
      ? (input.records.find(
          (x) =>
            x.requirementType === requirement.requirementType &&
            (x.issuerCountry ?? null) === (requirement.context.country ?? null),
        ) ??
          input.records.find(
            (x) => x.requirementType === requirement.requirementType && (x.issuerCountry ?? null) === null,
          ) ??
          null)
      : null;
    const state = deriveItemState({
      requirement,
      record,
      recordsReadable: input.recordsReadable,
      now: input.now,
      currentStage,
    });
    return {
      requirementType: requirement.requirementType,
      state,
      level: requirement.level,
      stage: requirement.stage,
      context: requirement.context,
      provenance: requirement.provenance,
      sourceUrl: requirement.sourceUrl ?? null,
      expiry: record?.validUntil ?? null,
      checkedBy: record?.checkedBy ?? null,
      checkedAt: record?.checkedAt ?? null,
      issuerCountry: record?.issuerCountry ?? null,
      recorded: record !== null,
    };
  });
  const open = items.filter((i) => OUTSTANDING.has(i.state));
  const unknownCount = items.filter((i) => i.state === "unknown").length;
  const nextStage =
    open.length === 0 ? null : open.reduce((a, b) => (stageRank(b.stage) < stageRank(a.stage) ? b : a)).stage;
  return {
    status:
      open.length > 0
        ? "checks_outstanding"
        : unknownCount > 0 && unknownCount === items.length
          ? "unknown"
          : "clear",
    outstanding: open.length,
    unknownCount,
    nextStage,
    items,
    personRecordsRead: input.recordsReadable,
  };
}
