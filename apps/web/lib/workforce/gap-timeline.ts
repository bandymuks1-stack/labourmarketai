/**
 * Gap timeline + recommendations (Labour Market OS P4) — pure projections
 * over the capacity assessment. Answers, per week/month bucket: when does
 * the need start, when does existing capacity become insufficient
 * (riskDate), how many people short, which skills, for which work, and how
 * risky that is.
 *
 * Risk thresholds (documented, deterministic):
 *   ok        bucket shortfall = 0.
 *   critical  shortfall ratio > CRITICAL_SHORTFALL_RATIO (0.2 — more than a
 *             fifth of the required heads missing), OR any supervisor or
 *             certificate shortfall inside the bucket (one missing
 *             supervisor / mandatory certificate can stop the whole site).
 *   tight     any other non-zero shortfall.
 *
 * riskDate = the first day capacity is insufficient: the later of the
 * first shortfall bucket's start and the earliest need start inside that
 * bucket (a need cannot be at risk before it begins).
 *
 * Recommendations are REALISTIC internal actions only — the closed
 * RECOMMENDED_ACTION_TYPES set. HARD RULE (guard- and test-pinned):
 * `create_position` may be recommended ONLY for a gap on a HUMAN-CONFIRMED
 * requirement (requirementStatus === "confirmed") — a machine-suggested
 * line may never spawn a position on its own.
 *
 * Pure module: no server-only import, no DB client, no IO.
 */
import {
  addDays,
  addMonths,
  firstDayOfMonth,
  rangesOverlapInclusive,
  startOfWeekMonday,
} from "@/lib/planning/planning-model";
import type { FutureWorkEntry } from "@/lib/workforce/future-work-model";
import type {
  CapacityAssessment,
  CapacityGapKind,
  RequirementCapacity,
} from "@/lib/workforce/capacity-model";

/* ------------------------------------------------------------------ */
/* Timeline                                                             */
/* ------------------------------------------------------------------ */

export const GAP_TIMELINE_GRANULARITIES = ["week", "month"] as const;
export type GapTimelineGranularity =
  (typeof GAP_TIMELINE_GRANULARITIES)[number];

export const GAP_RISK_LEVELS = ["ok", "tight", "critical"] as const;
export type GapRiskLevel = (typeof GAP_RISK_LEVELS)[number];

/** Shortfall ratio above which a bucket is critical (documented threshold). */
export const CRITICAL_SHORTFALL_RATIO = 0.2;

/** Bounded projection horizon — never an unbounded bucket loop. */
export const GAP_TIMELINE_MAX_BUCKETS = 104;

export interface GapTimelineBucket {
  /** Inclusive "YYYY-MM-DD" bucket bounds. */
  readonly bucketStart: string;
  readonly bucketEnd: string;
  /** Entries whose need band intersects this bucket. */
  readonly entryIds: readonly string[];
  readonly requiredHeadcount: number;
  readonly matchedHeadcount: number;
  readonly shortfall: number;
  /** Skill slugs with a non-zero shortfall inside this bucket. */
  readonly missingSkills: readonly string[];
  readonly riskLevel: GapRiskLevel;
}

export interface GapTimeline {
  readonly granularity: GapTimelineGranularity;
  readonly buckets: readonly GapTimelineBucket[];
  /** First day existing capacity is insufficient — null when never. */
  readonly riskDate: string | null;
  /** Entries with no start date — honestly outside the timeline. */
  readonly undatedEntryIds: readonly string[];
}

function bucketAnchor(day: string, granularity: GapTimelineGranularity): string {
  return granularity === "week" ? startOfWeekMonday(day) : firstDayOfMonth(day);
}

function nextBucket(day: string, granularity: GapTimelineGranularity): string {
  return granularity === "week" ? addDays(day, 7) : addMonths(day, 1);
}

function effectiveEnd(start: string, end: string | null): string {
  return end && end >= start ? end : start;
}

function riskLevelFor(
  required: number,
  shortfall: number,
  hasSupervisorShortfall: boolean,
  hasCertificateShortfall: boolean,
): GapRiskLevel {
  if (shortfall === 0) return "ok";
  if (hasSupervisorShortfall || hasCertificateShortfall) return "critical";
  if (required > 0 && shortfall / required > CRITICAL_SHORTFALL_RATIO) {
    return "critical";
  }
  return "tight";
}

/**
 * Project the assessed requirements onto week/month buckets covering every
 * dated need band. Deterministic; buckets carry only aggregate counts —
 * every number traces back to a requirement assessment.
 */
export function buildGapTimeline(
  entries: readonly FutureWorkEntry[],
  assessment: CapacityAssessment,
  options?: { readonly granularity?: GapTimelineGranularity },
): GapTimeline {
  const granularity = options?.granularity ?? "week";

  const dated = assessment.requirements.filter(
    (r) => r.needStartDate !== null,
  );
  // Undated needs: assessed requirements without a window PLUS composed
  // entries that never stated a start date — honestly outside the timeline.
  const undatedEntryIds = [
    ...new Set([
      ...assessment.requirements
        .filter((r) => r.needStartDate === null)
        .map((r) => r.entryId),
      ...entries.filter((e) => e.startDate === null).map((e) => e.id),
    ]),
  ].sort();

  if (dated.length === 0) {
    return { granularity, buckets: [], riskDate: null, undatedEntryIds };
  }

  let minDay = dated[0].needStartDate!;
  let maxDay = effectiveEnd(dated[0].needStartDate!, dated[0].needEndDate);
  for (const r of dated) {
    const start = r.needStartDate!;
    const end = effectiveEnd(start, r.needEndDate);
    if (start < minDay) minDay = start;
    if (end > maxDay) maxDay = end;
  }

  const buckets: GapTimelineBucket[] = [];
  let riskDate: string | null = null;
  let cursor = bucketAnchor(minDay, granularity);
  for (
    let i = 0;
    i < GAP_TIMELINE_MAX_BUCKETS && cursor <= maxDay;
    i++, cursor = nextBucket(cursor, granularity)
  ) {
    const bucketStart = cursor;
    const bucketEnd = addDays(nextBucket(cursor, granularity), -1);

    const inBucket = dated.filter((r) =>
      rangesOverlapInclusive(
        r.needStartDate!,
        effectiveEnd(r.needStartDate!, r.needEndDate),
        bucketStart,
        bucketEnd,
      ),
    );
    if (inBucket.length === 0) {
      buckets.push({
        bucketStart,
        bucketEnd,
        entryIds: [],
        requiredHeadcount: 0,
        matchedHeadcount: 0,
        shortfall: 0,
        missingSkills: [],
        riskLevel: "ok",
      });
      continue;
    }

    const required = inBucket.reduce((s, r) => s + r.headcountRequired, 0);
    const matched = inBucket.reduce(
      (s, r) => s + Math.min(r.matchedWorkerIds.length, r.headcountRequired),
      0,
    );
    const shortfall = inBucket.reduce(
      (s, r) => s + r.headcountGap.shortfall,
      0,
    );
    const missingSkills = [
      ...new Set(
        inBucket.flatMap((r) =>
          r.skillGaps
            .filter((g) => g.shortfall > 0)
            .map((g) => g.subject)
            .filter((s): s is string => s !== null),
        ),
      ),
    ].sort();
    const hasSupervisorShortfall = inBucket.some(
      (r) => (r.supervisorGap?.shortfall ?? 0) > 0,
    );
    const hasCertificateShortfall = inBucket.some((r) =>
      r.certificateGaps.some((g) => g.shortfall > 0),
    );

    if (shortfall > 0 && riskDate === null) {
      // A need cannot be at risk before it starts: clamp to the earliest
      // need start among the short requirements in this bucket.
      const shortStarts = inBucket
        .filter((r) => r.headcountGap.shortfall > 0)
        .map((r) => r.needStartDate!)
        .sort();
      const earliestShortStart = shortStarts[0] ?? bucketStart;
      riskDate =
        earliestShortStart > bucketStart ? earliestShortStart : bucketStart;
    }

    buckets.push({
      bucketStart,
      bucketEnd,
      entryIds: [...new Set(inBucket.map((r) => r.entryId))].sort(),
      requiredHeadcount: required,
      matchedHeadcount: matched,
      shortfall,
      missingSkills,
      riskLevel: riskLevelFor(
        required,
        shortfall,
        hasSupervisorShortfall,
        hasCertificateShortfall,
      ),
    });
  }

  return { granularity, buckets, riskDate, undatedEntryIds };
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                      */
/* ------------------------------------------------------------------ */

export const RECOMMENDED_ACTION_TYPES = [
  "assign_existing_worker",
  "transfer_from_project",
  "form_brigade",
  "train_existing_worker",
  "create_position",
  "engage_staffing_agency",
  "engage_partner",
] as const;
export type RecommendedActionType = (typeof RECOMMENDED_ACTION_TYPES)[number];

/** Shortfall size at which an agency engagement becomes worth suggesting. */
export const AGENCY_SHORTFALL_THRESHOLD = 5;
/** …or when more than half the required heads are missing. */
export const AGENCY_SHORTFALL_RATIO = 0.5;

export interface RecommendedAction {
  readonly type: RecommendedActionType;
  readonly requirementId: string;
  readonly entryId: string;
  /** Honest, human-readable trigger description (English, internal). */
  readonly reason: string;
  readonly evidence: {
    readonly gapKind: CapacityGapKind;
    readonly shortfall: number;
    /** Workers the action would involve (opaque ids). */
    readonly workerIds: readonly string[];
  };
}

function recommendForRequirement(
  rc: RequirementCapacity,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const shortfall = rc.headcountGap.shortfall;

  // Capacity that CAN cover — assign it before anything else.
  if (rc.matchedWorkerIds.length > 0) {
    actions.push({
      type: "assign_existing_worker",
      requirementId: rc.requirementId,
      entryId: rc.entryId,
      reason: `${rc.matchedWorkerIds.length} eligible worker(s) can cover this requirement now`,
      evidence: {
        gapKind: "headcount",
        shortfall,
        workerIds: rc.matchedWorkerIds,
      },
    });
  }

  // Fit workers committed elsewhere in the window — transfer candidates.
  if (shortfall > 0 && rc.busyMatchedWorkerIds.length > 0) {
    actions.push({
      type: "transfer_from_project",
      requirementId: rc.requirementId,
      entryId: rc.entryId,
      reason: `${shortfall} head(s) short while ${rc.busyMatchedWorkerIds.length} fitting worker(s) are committed on other work in the window`,
      evidence: {
        gapKind: "headcount",
        shortfall,
        workerIds: rc.busyMatchedWorkerIds,
      },
    });
  }

  // Brigade-shaped need with a partial brigade — form/complete one.
  if (rc.brigadeGap && rc.brigadeGap.shortfall > 0) {
    actions.push({
      type: "form_brigade",
      requirementId: rc.requirementId,
      entryId: rc.entryId,
      reason: `brigade-shaped need: best existing brigade covers ${rc.brigadeGap.matchedWorkerIds.length} of ${rc.brigadeGap.required}`,
      evidence: {
        gapKind: "brigade",
        shortfall: rc.brigadeGap.shortfall,
        workerIds: rc.brigadeGap.matchedWorkerIds,
      },
    });
  }

  // Skill gaps with near-miss workers — training beats hiring.
  for (const g of rc.skillGaps) {
    if (g.shortfall > 0 && rc.nearMissWorkerIds.length > 0) {
      actions.push({
        type: "train_existing_worker",
        requirementId: rc.requirementId,
        entryId: rc.entryId,
        reason: `skill "${g.subject}" is ${g.shortfall} head(s) short and ${rc.nearMissWorkerIds.length} worker(s) partially cover the skill set`,
        evidence: {
          gapKind: "skill",
          shortfall: g.shortfall,
          workerIds: rc.nearMissWorkerIds,
        },
      });
      break; // one training recommendation per requirement is enough
    }
  }

  // HARD GATE: create_position ONLY on a HUMAN-CONFIRMED requirement.
  // A machine-suggested line never spawns a position (guard-pinned).
  if (shortfall > 0 && rc.requirementStatus === "confirmed") {
    actions.push({
      type: "create_position",
      requirementId: rc.requirementId,
      entryId: rc.entryId,
      reason: `confirmed requirement is ${shortfall} head(s) short after internal options`,
      evidence: { gapKind: "headcount", shortfall, workerIds: [] },
    });
  }

  // Big remaining shortfalls — a staffing agency is realistic.
  if (
    shortfall >= AGENCY_SHORTFALL_THRESHOLD ||
    (rc.headcountRequired > 0 &&
      shortfall / rc.headcountRequired >= AGENCY_SHORTFALL_RATIO &&
      shortfall > 0)
  ) {
    actions.push({
      type: "engage_staffing_agency",
      requirementId: rc.requirementId,
      entryId: rc.entryId,
      reason: `${shortfall} of ${rc.headcountRequired} head(s) cannot be covered internally`,
      evidence: { gapKind: "headcount", shortfall, workerIds: [] },
    });
  }

  // Work that expects an external partner (company supply / subcontract).
  if (rc.partnerNeeded) {
    actions.push({
      type: "engage_partner",
      requirementId: rc.requirementId,
      entryId: rc.entryId,
      reason: "the demand itself expects an external partner (company supply / subcontract)",
      evidence: { gapKind: "headcount", shortfall, workerIds: [] },
    });
  }

  return actions;
}

/**
 * Realistic next actions per assessed requirement — deterministic order
 * (assessment order, then the fixed per-requirement rule order above).
 * Every action names its trigger gap; nothing is recommended without an
 * evidencing gap.
 */
export function recommendActions(
  assessment: CapacityAssessment,
): readonly RecommendedAction[] {
  return assessment.requirements.flatMap(recommendForRequirement);
}
