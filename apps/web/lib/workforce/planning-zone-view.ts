/**
 * Planning-zone view model (Labour Market OS P10) — the pure data shaping
 * behind the ONE visual workforce-planning zone inside the company
 * workspace (`/dashboard/company/planning`). The page stays thin: it fetches
 * via lib/workforce/workforce.ts and renders exactly what this module
 * returns.
 *
 * Composition (all existing P1–P4 modules — never a duplicate model):
 *   entries        composeFutureWork output (passed in from the read service)
 *   requirements   the stored human plan (payload.workforce_plan) when the
 *                  demand carries one, else deterministic derivation
 *                  (deriveWorkforceRequirements). A plan whose lines were all
 *                  REJECTED is honoured — rejection never resurrects the
 *                  machine suggestion.
 *   assessment     assessCapacity over the real internal supply
 *   timeline       buildGapTimeline (month granularity — the zone renders a
 *                  vertical month-bucketed timeline, no horizontal scroll)
 *   actions        recommendActions — the FIRST action is the zone's single
 *                  primary CTA; the rest render as a quiet text list.
 *
 * CTA resolution maps each closed action kind to a REAL existing surface —
 * never a dead button. A kind with no existing surface today
 * (train_existing_worker) resolves to `{ kind: "status" }` and the page
 * renders plain explanatory text instead of a control (constitution §8).
 *
 * Pure module: no server-only import, no DB client, no IO.
 */
import type {
  FutureWorkEntry,
  FutureWorkSource,
  WorkforcePlanV1,
  WorkforceRequirement,
} from "@/lib/workforce/future-work-model";
import {
  deriveWorkforceRequirements,
  type WorkforceCatalog,
} from "@/lib/workforce/work-breakdown";
import {
  assessCapacity,
  type BrigadeInput,
  type CapacityAssessment,
  type WorkerAssignmentInput,
  type WorkerCapacityInput,
} from "@/lib/workforce/capacity-model";
import {
  buildGapTimeline,
  recommendActions,
  type GapRiskLevel,
  type RecommendedAction,
  type RecommendedActionType,
} from "@/lib/workforce/gap-timeline";
import type { WorkforceSources } from "@/lib/workforce/workforce";

/* ------------------------------------------------------------------ */
/* Input                                                                */
/* ------------------------------------------------------------------ */

export interface PlanningZoneInput {
  readonly entries: readonly FutureWorkEntry[];
  /** entryId (`demand:<id>`) → stored human plan, where one exists. */
  readonly plans: Readonly<Record<string, WorkforcePlanV1>>;
  readonly workers: readonly WorkerCapacityInput[];
  readonly assignments: readonly WorkerAssignmentInput[];
  readonly brigades: readonly BrigadeInput[];
  readonly sources: WorkforceSources;
  readonly catalog: WorkforceCatalog;
}

/* ------------------------------------------------------------------ */
/* Output                                                               */
/* ------------------------------------------------------------------ */

/** One timeline row — a real composed entry with its capacity numbers. */
export interface PlanningZoneEntry {
  readonly id: string;
  readonly source: FutureWorkSource;
  readonly title: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Real destination for the row (projects have a detail page; demand
   *  entries have no detail surface — honest null, no invented link). */
  readonly href: string | null;
  readonly requiredHeadcount: number;
  readonly coveredHeadcount: number;
}

export interface PlanningZoneMonth {
  /** "YYYY-MM" — the bucket is the entries' start month. */
  readonly monthIso: string;
  readonly entries: readonly PlanningZoneEntry[];
  readonly requiredHeadcount: number;
  readonly coveredHeadcount: number;
  readonly shortfall: number;
  /** 0–100 (capped) — required 0 renders a full bar (nothing missing). */
  readonly coveragePct: number;
  /** Model risk of the matching gap-timeline month bucket ("ok" when the
   *  model produced no bucket for this month). */
  readonly riskLevel: GapRiskLevel;
}

export type ZoneCtaTarget =
  | { readonly kind: "route"; readonly href: string }
  | { readonly kind: "demand-intake" }
  | { readonly kind: "status" };

export interface ZoneAction {
  readonly type: RecommendedActionType;
  readonly entryId: string;
  readonly entryTitle: string | null;
  readonly shortfall: number;
  readonly target: ZoneCtaTarget;
}

export type PlanningZoneNoteId =
  | "assignmentsPending"
  | "languagesPending"
  | "brigadesPending"
  | "demandError"
  | "projectError"
  | "capacityError";

export interface PlanningZoneView {
  readonly isEmpty: boolean;
  readonly months: readonly PlanningZoneMonth[];
  readonly undated: readonly PlanningZoneEntry[];
  readonly totals: {
    readonly requiredHeadcount: number;
    readonly coveredHeadcount: number;
    readonly shortfall: number;
    readonly coveragePct: number;
    readonly requiredHours: number | null;
    readonly shortfallHours: number | null;
  };
  /** Skill slugs with a non-zero shortfall anywhere in the assessment. */
  readonly missingSkills: readonly string[];
  readonly risk: {
    readonly level: GapRiskLevel;
    readonly riskDate: string | null;
  };
  /** The single primary recommendation (first realistic action) — null when
   *  nothing needs doing. */
  readonly primaryAction: ZoneAction | null;
  /** Remaining recommendations, deduplicated by kind — quiet text list. */
  readonly secondaryActions: readonly ZoneAction[];
  readonly notes: readonly PlanningZoneNoteId[];
}

/* ------------------------------------------------------------------ */
/* CTA resolution — closed kind → REAL existing surface                 */
/* ------------------------------------------------------------------ */

/**
 * Map one recommended action to a real existing surface. Routes here MUST
 * exist as pages (guard: lib/guards/labour-market-os-surface.test.ts):
 *   assign_existing_worker  → the project's own page (project entries) or
 *                             the projects/assignments board
 *   transfer_from_project   → the projects/assignments board
 *   form_brigade            → the company workspace team section
 *   train_existing_worker   → NO existing surface — plain status, no button
 *   create_position         → the EXISTING demand form (the demand-intake
 *                             wizard, opened via the audited server action)
 *   engage_staffing_agency  → the existing company scouting surface
 *   engage_partner          → the existing service-requests surface
 */
export function resolveActionTarget(
  action: RecommendedAction,
  entryById: ReadonlyMap<string, FutureWorkEntry>,
): ZoneCtaTarget {
  switch (action.type) {
    case "assign_existing_worker": {
      const entry = entryById.get(action.entryId);
      return entry?.source === "project"
        ? { kind: "route", href: `/dashboard/projects/${entry.sourceId}` }
        : { kind: "route", href: "/dashboard/projects" };
    }
    case "transfer_from_project":
      return { kind: "route", href: "/dashboard/projects" };
    case "form_brigade":
      return { kind: "route", href: "/dashboard/company#company-team" };
    case "train_existing_worker":
      // No training surface exists today — honest status, never a dead button.
      return { kind: "status" };
    case "create_position":
      return { kind: "demand-intake" };
    case "engage_staffing_agency":
      return { kind: "route", href: "/dashboard/company/scouting" };
    case "engage_partner":
      return { kind: "route", href: "/dashboard/service-requests" };
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function clampPct(covered: number, required: number): number {
  if (required <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((covered / required) * 100)));
}

function entryHref(entry: FutureWorkEntry): string | null {
  // Same source-link doctrine as lib/planning/planning-model hrefForSource:
  // projects own a real detail page; demand rows have no detail surface.
  return entry.source === "project"
    ? `/dashboard/projects/${entry.sourceId}`
    : null;
}

/** Requirements of one entry: the stored human plan wins (including a plan
 *  whose lines were all rejected — rejection is final until re-derivation);
 *  entries without a plan get the deterministic suggestion. */
export function requirementsForEntry(
  entry: FutureWorkEntry,
  plans: Readonly<Record<string, WorkforcePlanV1>>,
  catalog: WorkforceCatalog,
): readonly WorkforceRequirement[] {
  const plan = plans[entry.id];
  if (plan) {
    const own = plan.requirements.filter((r) => r.entryId === entry.id);
    if (own.length > 0) return own;
  }
  return deriveWorkforceRequirements(entry, catalog);
}

const RISK_ORDER: Readonly<Record<GapRiskLevel, number>> = {
  ok: 0,
  tight: 1,
  critical: 2,
};

function worstRisk(levels: readonly GapRiskLevel[]): GapRiskLevel {
  let worst: GapRiskLevel = "ok";
  for (const l of levels) if (RISK_ORDER[l] > RISK_ORDER[worst]) worst = l;
  return worst;
}

function collectNotes(sources: WorkforceSources): readonly PlanningZoneNoteId[] {
  const notes: PlanningZoneNoteId[] = [];
  if (sources.demand.status === "error") notes.push("demandError");
  if (sources.project.status === "error") notes.push("projectError");
  if (sources.assignments.status === "needs-migration") {
    notes.push("assignmentsPending");
  }
  if (sources.languages.status === "needs-migration") {
    notes.push("languagesPending");
  }
  if (sources.brigades.status === "needs-migration") {
    notes.push("brigadesPending");
  }
  const capacityErrored = (
    [
      sources.assignments,
      sources.workers,
      sources.skills,
      sources.professions,
      sources.languages,
      sources.certificates,
      sources.brigades,
    ] as const
  ).some((s) => s.status === "error");
  if (capacityErrored) notes.push("capacityError");
  return notes;
}

/* ------------------------------------------------------------------ */
/* Build                                                                */
/* ------------------------------------------------------------------ */

export function buildPlanningZoneView(
  input: PlanningZoneInput,
): PlanningZoneView {
  const entryById = new Map(input.entries.map((e) => [e.id, e]));

  const requirements = input.entries.flatMap((e) =>
    requirementsForEntry(e, input.plans, input.catalog),
  );
  const assessment: CapacityAssessment = assessCapacity(
    requirements,
    {
      workers: input.workers,
      assignments: input.assignments,
      brigades: input.brigades,
    },
    { entries: input.entries },
  );
  const timeline = buildGapTimeline(input.entries, assessment, {
    granularity: "month",
  });
  const actions = recommendActions(assessment);

  // Per-entry aggregates — every number traces to the assessment.
  const perEntry = new Map<string, { required: number; covered: number }>();
  for (const r of assessment.requirements) {
    const agg = perEntry.get(r.entryId) ?? { required: 0, covered: 0 };
    agg.required += r.headcountRequired;
    agg.covered += Math.min(r.matchedWorkerIds.length, r.headcountRequired);
    perEntry.set(r.entryId, agg);
  }

  const toZoneEntry = (e: FutureWorkEntry): PlanningZoneEntry => {
    const agg = perEntry.get(e.id) ?? { required: 0, covered: 0 };
    return {
      id: e.id,
      source: e.source,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      href: entryHref(e),
      requiredHeadcount: agg.required,
      coveredHeadcount: agg.covered,
    };
  };

  // Month groups keyed by the entries' START month (each entry appears once).
  const bucketRiskByMonth = new Map<string, GapRiskLevel>();
  for (const b of timeline.buckets) {
    bucketRiskByMonth.set(b.bucketStart.slice(0, 7), b.riskLevel);
  }
  const byMonth = new Map<string, PlanningZoneEntry[]>();
  const undated: PlanningZoneEntry[] = [];
  for (const e of input.entries) {
    const row = toZoneEntry(e);
    if (!e.startDate) {
      undated.push(row);
      continue;
    }
    const month = e.startDate.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }
  const months: PlanningZoneMonth[] = [...byMonth.keys()].sort().map((m) => {
    const rows = (byMonth.get(m) ?? []).sort((a, b) =>
      `${a.startDate}|${a.id}` < `${b.startDate}|${b.id}` ? -1 : 1,
    );
    const required = rows.reduce((s, r) => s + r.requiredHeadcount, 0);
    const covered = rows.reduce((s, r) => s + r.coveredHeadcount, 0);
    return {
      monthIso: m,
      entries: rows,
      requiredHeadcount: required,
      coveredHeadcount: covered,
      shortfall: Math.max(0, required - covered),
      coveragePct: clampPct(covered, required),
      riskLevel: bucketRiskByMonth.get(m) ?? "ok",
    };
  });

  // Totals.
  const totalRequired = assessment.requirements.reduce(
    (s, r) => s + r.headcountRequired,
    0,
  );
  const totalCovered = assessment.requirements.reduce(
    (s, r) => s + Math.min(r.matchedWorkerIds.length, r.headcountRequired),
    0,
  );
  const hourRows = assessment.requirements.filter(
    (r) => r.hoursGap.requiredHours !== null,
  );
  const requiredHours =
    hourRows.length > 0
      ? hourRows.reduce((s, r) => s + (r.hoursGap.requiredHours ?? 0), 0)
      : null;
  const shortfallHours =
    hourRows.length > 0
      ? hourRows.reduce((s, r) => s + (r.hoursGap.shortfallHours ?? 0), 0)
      : null;

  const missingSkills = [
    ...new Set(
      assessment.requirements.flatMap((r) =>
        r.skillGaps
          .filter((g) => g.shortfall > 0)
          .map((g) => g.subject)
          .filter((s): s is string => s !== null),
      ),
    ),
  ].sort();

  const toZoneAction = (a: RecommendedAction): ZoneAction => ({
    type: a.type,
    entryId: a.entryId,
    entryTitle: entryById.get(a.entryId)?.title ?? null,
    shortfall: a.evidence.shortfall,
    target: resolveActionTarget(a, entryById),
  });
  const primaryAction = actions.length > 0 ? toZoneAction(actions[0]) : null;
  const seenKinds = new Set<RecommendedActionType>(
    primaryAction ? [primaryAction.type] : [],
  );
  const secondaryActions: ZoneAction[] = [];
  for (const a of actions.slice(1)) {
    if (seenKinds.has(a.type)) continue;
    seenKinds.add(a.type);
    secondaryActions.push(toZoneAction(a));
    if (secondaryActions.length >= 4) break;
  }

  return {
    isEmpty: input.entries.length === 0,
    months,
    undated,
    totals: {
      requiredHeadcount: totalRequired,
      coveredHeadcount: totalCovered,
      shortfall: assessment.totalHeadcountShortfall,
      coveragePct: clampPct(totalCovered, totalRequired),
      requiredHours,
      shortfallHours,
    },
    missingSkills,
    risk: {
      level: worstRisk(timeline.buckets.map((b) => b.riskLevel)),
      riskDate: timeline.riskDate,
    },
    primaryAction,
    secondaryActions,
    notes: collectNotes(input.sources),
  };
}
