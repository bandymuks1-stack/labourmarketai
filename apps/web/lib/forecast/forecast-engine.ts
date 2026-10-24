import { addDays, daysBetween, dayWithin, isIsoDay } from "./forecast-days";

/**
 * PROJECT FORECAST ENGINE — one deterministic reading of a project's FACTS
 * into a FORECAST (owner order 2026-10-24, Stage 7).
 *
 * ── SEP-1: FACT ≠ DERIVED ≠ FORECAST ──────────────────────────────────────
 * Input is facts only (hours recorded, tasks and stages finished, the team,
 * approved absences, defects, budget and actual cost), already read through
 * the canonical rules (one work-time rule, one counting rule, one ledger at a
 * time). Output is a FORECAST and says so in its type: every number is a
 * reading of the past carried forward under STATED assumptions, with its
 * confidence, its sources and the engine version that produced it. Nothing
 * here writes, and nothing here may ever be read back as a fact.
 *
 * ── DETERMINISTIC ─────────────────────────────────────────────────────────
 * Same facts → same forecast, byte for byte. No clock (`facts.today` is the
 * "as of" day), no randomness, no LLM. An LLM may interpret unstructured
 * input upstream or explain the result downstream; it never computes a
 * number here.
 *
 * ── SPARSE EVIDENCE STAYS SPARSE (SEP-7) ──────────────────────────────────
 * Below the evidence thresholds a figure is NULL with a reason, never a guess
 * and never a zero. UNKNOWN input (a read that failed or was truncated) stays
 * UNKNOWN in the output.
 *
 * ── FORMULAS (v1) ─────────────────────────────────────────────────────────
 * W = TRAILING_WINDOW_DAYS calendar days ending `today`.
 *   unit             countable LEAF tasks (progress-model counting rule); if
 *                    the project has none, stages
 *   remaining        units − done units
 *   hoursPerUnit     all hours on the chosen ledger ÷ done units
 *                    (needs ≥ MIN_DONE_UNITS done units and hours > 0)
 *   recentPerUnit    hours in W ÷ units done in W   → productivity trend
 *   dailyHours       hours in W ÷ W   (calendar-day rate: no invented work
 *                    calendar; needs ≥ MIN_ACTIVE_DAYS days with hours in W)
 *   requiredHours    remaining × hoursPerUnit
 *   perPerson        dailyHours ÷ people who recorded hours in W (else the
 *                    current team size)
 *   completion       day-by-day from tomorrow, each day adding
 *                    perPersonDailyHours × (activePeople − people absent that
 *                    day), until requiredHours is covered (cap
 *                    MAX_HORIZON_DAYS). Without hours: remaining ÷ (units done
 *                    in W ÷ W) days ("throughput" method, no absence model).
 *   slack            plannedEnd − completion; risk: overdue (plannedEnd <
 *                    today, work left) · likely_miss (slack < 0) · tight
 *                    (slack < max(3, 10 % of the days to completion)) ·
 *                    on_track
 *   workersNeeded    ⌈(requiredHours ÷ perPersonDailyHours + absence
 *                    person-days before the deadline) ÷ days left⌉
 *   workerGap        workersNeeded − activePeople (negative = spare people)
 *   partnerNeed      max(0, workerGap − free internal people) — only when the
 *                    free internal people are known
 *   costPerHour      actual cost ÷ hours so far (only when both are known)
 *   extraCost        actual + requiredHours × costPerHour − budget
 *   quality risk     weighted open defects (critical 4, high 2, medium 1,
 *                    low ¼): high (any critical, or ≥ 8) · elevated (any
 *                    high, a failed correction, or ≥ 4) · low (any) · none
 */

export const FORECAST_ENGINE_VERSION = "forecast-engine-v1" as const;

export const TRAILING_WINDOW_DAYS = 28;
/** Below this many finished units there is no hours-per-unit reading. */
export const MIN_DONE_UNITS = 3;
/** At or above this many finished units the reading counts as established. */
export const ESTABLISHED_DONE_UNITS = 8;
/** Days with recorded hours in the window before a daily rate is read. */
export const MIN_ACTIVE_DAYS = 3;
/** Days with recorded hours in the window for a "steady" rate. */
export const STEADY_ACTIVE_DAYS = 10;
/** The completion walk stops here: beyond it the date is honestly unknown. */
export const MAX_HORIZON_DAYS = 3 * 365;

// ── INPUT: facts ───────────────────────────────────────────────────────────

export interface ForecastSource {
  /** The relation or canonical read the fact came from. */
  readonly key: string;
  /** Rows the fact rests on; null when not counted. */
  readonly rows: number | null;
  /** "read" | "truncated" | "unavailable" | "not_installed". */
  readonly state: "read" | "truncated" | "unavailable" | "not_installed";
}

export interface ForecastUnitFacts {
  readonly total: number;
  readonly done: number;
  readonly blocked: number;
  /** ISO days on which done units were finished, when the day is known. */
  readonly completedOn: readonly string[];
}

export interface ForecastFacts {
  readonly projectId: string;
  /** The "as of" calendar day. */
  readonly today: string;
  readonly project: {
    readonly status: string;
    readonly startDate: string | null;
    /** projects.end_date — the planned end, the deadline the forecast is held to. */
    readonly plannedEnd: string | null;
  };
  /** Countable leaf tasks; null = UNKNOWN (failed or truncated read). */
  readonly tasks: ForecastUnitFacts | null;
  /** Countable stages; null = UNKNOWN. */
  readonly stages: (ForecastUnitFacts & { readonly overdue: number }) | null;
  /** ONE ledger, never two added together; null = UNKNOWN. */
  readonly hours: {
    readonly basis: "journal" | "organization_ledger" | "none";
    readonly byDay: readonly { readonly day: string; readonly hours: number }[];
    readonly totalHours: number;
    /** Journal only: hours on independently approved entries. */
    readonly confirmedHours: number | null;
    /** The ledger NOT chosen, carried beside for the reader — never added. */
    readonly otherLedgerHours: number | null;
    /** false when the read stopped at its ceiling. */
    readonly complete: boolean;
    /** People who recorded hours in the trailing window — the divisor of
     *  the per-person rate, so a person leaving lowers future capacity
     *  instead of being absorbed by the others. null = not known (the
     *  current team size is used). */
    readonly contributorsInWindow: number | null;
  } | null;
  readonly team: {
    readonly activePeople: number;
    /** Approved absences of the team ahead: people absent per day. */
    readonly absences: readonly { readonly day: string; readonly peopleAbsent: number }[];
    /** People on the organization's roster with nothing recorded against
     *  them; null = not known (partner need then stays unknown). */
    readonly freeInternalPeople: number | null;
  } | null;
  readonly quality: {
    readonly open: { readonly low: number; readonly medium: number; readonly high: number; readonly critical: number };
    readonly overdueOpen: number;
    readonly failedCorrections: number;
  } | null;
  readonly readiness: { readonly workersWithMissingItems: number } | null;
  readonly economics: {
    /** Approved/drafted budget baseline in cents; null = no budget recorded. */
    readonly budgetCents: number | null;
    /** Actual cost so far (expenses + received invoices), cents; null = unknown. */
    readonly actualCostCents: number | null;
  } | null;
  readonly sources: readonly ForecastSource[];
}

// ── OUTPUT: forecast ───────────────────────────────────────────────────────

export type DeadlineRisk = "on_track" | "tight" | "likely_miss" | "overdue" | "unknown";
export type QualityRisk = "none" | "low" | "elevated" | "high" | "unknown";
export type ForecastConfidence = "insufficient" | "low" | "medium" | "high";
export type ProductivityTrend = "improving" | "steady" | "declining";

export interface ForecastAssumption {
  readonly key:
    | "trailing_window_days"
    | "calendar_day_rate"
    | "equal_unit_weight"
    | "unit_is_stage"
    | "team_stays_as_is"
    | "absences_as_approved"
    | "throughput_without_hours"
    | "cost_continues_at_observed_rate"
    | "single_hours_ledger"
    | "hours_partly_unconfirmed"
    | "hours_read_truncated"
    | "free_internal_people_unknown";
  readonly value?: number | string;
}

export interface ForecastAction {
  readonly key:
    | "add_workers"
    | "find_partner_capacity"
    | "unblock_stages"
    | "unblock_tasks"
    | "close_serious_defects"
    | "complete_readiness"
    | "record_hours"
    | "set_planned_end"
    | "break_down_scope"
    | "review_budget"
    | "replan_deadline";
  readonly value?: number;
}

export interface ProjectForecast {
  readonly kind: "forecast";
  readonly engineVersion: typeof FORECAST_ENGINE_VERSION;
  readonly projectId: string;
  readonly asOf: string;
  readonly status: "ok" | "insufficient_data" | "not_applicable";
  readonly remaining: {
    readonly unit: "tasks" | "stages" | null;
    readonly total: number | null;
    readonly done: number | null;
    readonly remaining: number | null;
  };
  readonly productivity: {
    readonly hoursPerUnit: number | null;
    readonly recentHoursPerUnit: number | null;
    readonly trend: ProductivityTrend | null;
    readonly dailyHours: number | null;
    readonly unitsPerDay: number | null;
    readonly activeDaysInWindow: number | null;
  };
  readonly requiredHours: number | null;
  readonly completion: {
    readonly date: string | null;
    readonly method: "hours" | "throughput" | "done" | null;
    readonly daysFromToday: number | null;
    readonly beyondHorizon: boolean;
  };
  readonly deadline: {
    readonly plannedEnd: string | null;
    readonly slackDays: number | null;
    readonly risk: DeadlineRisk;
  };
  readonly workforce: {
    readonly activePeople: number | null;
    readonly perPersonDailyHours: number | null;
    readonly workersNeeded: number | null;
    readonly workerGap: number | null;
    readonly partnerNeed: number | null;
    readonly absencePersonDaysBeforeDeadline: number | null;
    readonly capacityHoursBeforeDeadline: number | null;
    readonly capacityGapHours: number | null;
  };
  readonly quality: {
    readonly risk: QualityRisk;
    readonly openDefects: number | null;
    readonly seriousOpen: number | null;
    readonly overdueOpen: number | null;
  };
  readonly cost: {
    readonly budgetCents: number | null;
    readonly actualCostCents: number | null;
    readonly costPerHourCents: number | null;
    readonly forecastTotalCostCents: number | null;
    readonly possibleExtraCostCents: number | null;
  };
  readonly losses: {
    readonly lateDays: number | null;
    readonly possibleExtraCostCents: number | null;
  };
  readonly actions: readonly ForecastAction[];
  readonly confidence: ForecastConfidence;
  readonly assumptions: readonly ForecastAssumption[];
  readonly sources: readonly ForecastSource[];
}

// ── helpers ────────────────────────────────────────────────────────────────

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const nonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

function pickUnit(facts: ForecastFacts): { unit: "tasks" | "stages"; f: ForecastUnitFacts } | null {
  if (facts.tasks && facts.tasks.total > 0) return { unit: "tasks", f: facts.tasks };
  if (facts.tasks === null) return null; // UNKNOWN tasks: never fall back to stages as if there were none
  if (facts.stages && facts.stages.total > 0) return { unit: "stages", f: facts.stages };
  return null;
}

function qualityOf(q: ForecastFacts["quality"]): ProjectForecast["quality"] {
  if (q === null) return { risk: "unknown", openDefects: null, seriousOpen: null, overdueOpen: null };
  const { low, medium, high, critical } = q.open;
  const open = low + medium + high + critical;
  const weight = critical * 4 + high * 2 + medium + low * 0.25;
  const risk: QualityRisk =
    critical > 0 || weight >= 8
      ? "high"
      : high > 0 || q.failedCorrections > 0 || weight >= 4
        ? "elevated"
        : open > 0
          ? "low"
          : "none";
  return { risk, openDefects: open, seriousOpen: high + critical, overdueOpen: q.overdueOpen };
}

const EMPTY_WORKFORCE: ProjectForecast["workforce"] = {
  activePeople: null,
  perPersonDailyHours: null,
  workersNeeded: null,
  workerGap: null,
  partnerNeed: null,
  absencePersonDaysBeforeDeadline: null,
  capacityHoursBeforeDeadline: null,
  capacityGapHours: null,
};

// ── the engine ─────────────────────────────────────────────────────────────

export function computeProjectForecast(facts: ForecastFacts): ProjectForecast {
  const today = facts.today;
  const windowStart = addDays(today, -(TRAILING_WINDOW_DAYS - 1));
  const assumptions: ForecastAssumption[] = [{ key: "trailing_window_days", value: TRAILING_WINDOW_DAYS }];
  const actions: ForecastAction[] = [];
  const quality = qualityOf(facts.quality);
  const plannedEnd = isIsoDay(facts.project.plannedEnd) ? facts.project.plannedEnd : null;

  const base = {
    kind: "forecast" as const,
    engineVersion: FORECAST_ENGINE_VERSION,
    projectId: facts.projectId,
    asOf: today,
    sources: facts.sources,
  };

  // A finished project is measured, not forecast (see forecast-history.ts).
  if (facts.project.status === "completed") {
    return {
      ...base,
      status: "not_applicable",
      remaining: { unit: null, total: null, done: null, remaining: null },
      productivity: { hoursPerUnit: null, recentHoursPerUnit: null, trend: null, dailyHours: null, unitsPerDay: null, activeDaysInWindow: null },
      requiredHours: null,
      completion: { date: null, method: null, daysFromToday: null, beyondHorizon: false },
      deadline: { plannedEnd, slackDays: null, risk: "unknown" },
      workforce: EMPTY_WORKFORCE,
      quality,
      cost: { budgetCents: facts.economics?.budgetCents ?? null, actualCostCents: facts.economics?.actualCostCents ?? null, costPerHourCents: null, forecastTotalCostCents: null, possibleExtraCostCents: null },
      losses: { lateDays: null, possibleExtraCostCents: null },
      actions: [],
      confidence: "insufficient",
      assumptions,
    };
  }

  // ── scope ────────────────────────────────────────────────────────────────
  const picked = pickUnit(facts);
  if (picked?.unit === "stages") assumptions.push({ key: "unit_is_stage" });
  if (picked) assumptions.push({ key: "equal_unit_weight" });
  const unitTotal = picked ? picked.f.total : null;
  const unitDone = picked ? Math.min(picked.f.done, picked.f.total) : null;
  const remainingUnits = unitTotal !== null && unitDone !== null ? unitTotal - unitDone : null;
  const doneInWindow = picked ? picked.f.completedOn.filter((d) => isIsoDay(d) && dayWithin(d, windowStart, today)).length : 0;

  // ── hours on ONE ledger ──────────────────────────────────────────────────
  const hours = facts.hours;
  let totalHours: number | null = null;
  let windowHours = 0;
  let activeDays = 0;
  if (hours && hours.basis !== "none") {
    assumptions.push({ key: "single_hours_ledger", value: hours.basis });
    if (!hours.complete) assumptions.push({ key: "hours_read_truncated" });
    totalHours = round2(nonNeg(hours.totalHours));
    const byDay = new Map<string, number>();
    for (const d of hours.byDay) {
      if (!isIsoDay(d.day) || !dayWithin(d.day, windowStart, today)) continue;
      byDay.set(d.day, (byDay.get(d.day) ?? 0) + nonNeg(d.hours));
    }
    for (const h of byDay.values()) {
      windowHours += h;
      if (h > 0) activeDays++;
    }
    windowHours = round2(windowHours);
    if (hours.basis === "journal" && hours.confirmedHours !== null && totalHours > 0 && hours.confirmedHours < totalHours) {
      assumptions.push({ key: "hours_partly_unconfirmed", value: round2(hours.confirmedHours / totalHours) });
    }
  } else if (hours && hours.basis === "none") {
    totalHours = 0;
  }

  const hoursPerUnit =
    unitDone !== null && unitDone >= MIN_DONE_UNITS && totalHours !== null && totalHours > 0
      ? round2(totalHours / unitDone)
      : null;
  const recentHoursPerUnit = doneInWindow >= MIN_DONE_UNITS && windowHours > 0 ? round2(windowHours / doneInWindow) : null;
  const trend: ProductivityTrend | null =
    hoursPerUnit !== null && recentHoursPerUnit !== null
      ? recentHoursPerUnit < hoursPerUnit * 0.9
        ? "improving"
        : recentHoursPerUnit > hoursPerUnit * 1.1
          ? "declining"
          : "steady"
      : null;
  const dailyHours = activeDays >= MIN_ACTIVE_DAYS ? round2(windowHours / TRAILING_WINDOW_DAYS) : null;
  if (dailyHours !== null) assumptions.push({ key: "calendar_day_rate" });
  const unitsPerDay = doneInWindow >= MIN_DONE_UNITS ? round2(doneInWindow / TRAILING_WINDOW_DAYS) : null;

  // ── team ─────────────────────────────────────────────────────────────────
  const team = facts.team;
  const activePeople = team ? Math.max(0, Math.floor(team.activePeople)) : null;
  const absentOn = new Map<string, number>();
  for (const a of team?.absences ?? []) {
    if (!isIsoDay(a.day)) continue;
    absentOn.set(a.day, (absentOn.get(a.day) ?? 0) + nonNeg(a.peopleAbsent));
  }
  if (team && absentOn.size > 0) assumptions.push({ key: "absences_as_approved" });
  const contributors = hours?.contributorsInWindow ?? null;
  const rateDivisor = contributors !== null && contributors > 0 ? contributors : activePeople;
  const perPersonDailyHours =
    dailyHours !== null && rateDivisor !== null && rateDivisor > 0 ? round2(dailyHours / rateDivisor) : null;

  // ── required hours + completion ──────────────────────────────────────────
  let requiredHours: number | null = null;
  let completionDate: string | null = null;
  let method: ProjectForecast["completion"]["method"] = null;
  let beyondHorizon = false;

  if (remainingUnits === 0 && unitTotal !== null && unitTotal > 0) {
    requiredHours = 0;
    completionDate = today;
    method = "done";
  } else if (remainingUnits !== null && remainingUnits > 0 && hoursPerUnit !== null && perPersonDailyHours !== null && activePeople !== null) {
    requiredHours = round1(remainingUnits * hoursPerUnit);
    method = "hours";
    assumptions.push({ key: "team_stays_as_is", value: activePeople });
    let covered = 0;
    for (let i = 1; i <= MAX_HORIZON_DAYS; i++) {
      const day = addDays(today, i);
      const present = Math.max(0, activePeople - (absentOn.get(day) ?? 0));
      covered += perPersonDailyHours * present;
      if (covered + 1e-9 >= requiredHours) {
        completionDate = day;
        break;
      }
    }
    if (completionDate === null) beyondHorizon = true;
  } else if (remainingUnits !== null && remainingUnits > 0 && hoursPerUnit !== null) {
    // Hours per unit are known but there is no current daily rate (or no team):
    // the hours needed are a reading; the date is not. With NOBODY on the team
    // the work cannot finish as things stand — beyond any horizon.
    requiredHours = round1(remainingUnits * hoursPerUnit);
    if (activePeople === 0) beyondHorizon = true;
  } else if (remainingUnits !== null && remainingUnits > 0 && unitsPerDay !== null && unitsPerDay > 0) {
    method = "throughput";
    assumptions.push({ key: "throughput_without_hours" });
    const days = Math.ceil(remainingUnits / unitsPerDay);
    if (days <= MAX_HORIZON_DAYS) completionDate = addDays(today, days);
    else beyondHorizon = true;
  }
  const daysFromToday = completionDate ? daysBetween(today, completionDate) : null;

  // ── deadline ─────────────────────────────────────────────────────────────
  const workLeft = remainingUnits === null || remainingUnits > 0;
  let slackDays: number | null = null;
  let risk: DeadlineRisk = "unknown";
  if (plannedEnd && plannedEnd < today && workLeft && method !== "done") {
    risk = "overdue";
    slackDays = completionDate ? daysBetween(completionDate, plannedEnd) : daysBetween(today, plannedEnd);
  } else if (plannedEnd && completionDate) {
    slackDays = daysBetween(completionDate, plannedEnd);
    const tightBelow = Math.max(3, Math.ceil((daysFromToday ?? 0) * 0.1));
    risk = slackDays < 0 ? "likely_miss" : slackDays < tightBelow && method !== "done" ? "tight" : "on_track";
  } else if (plannedEnd && beyondHorizon) {
    risk = "likely_miss";
  }

  // ── workforce need to hold the deadline ──────────────────────────────────
  let workforce: ProjectForecast["workforce"] = { ...EMPTY_WORKFORCE, activePeople, perPersonDailyHours };
  if (plannedEnd && plannedEnd > today && requiredHours !== null && perPersonDailyHours !== null && activePeople !== null) {
    const daysLeft = daysBetween(today, plannedEnd);
    let absencePersonDays = 0;
    for (const [day, n] of absentOn) if (day > today && day <= plannedEnd) absencePersonDays += Math.min(n, activePeople);
    const personDaysNeeded = requiredHours / perPersonDailyHours;
    const workersNeeded = requiredHours === 0 ? 0 : Math.ceil((personDaysNeeded + absencePersonDays) / daysLeft - 1e-9);
    const workerGap = workersNeeded - activePeople;
    const capacityHours = round1(perPersonDailyHours * Math.max(0, activePeople * daysLeft - absencePersonDays));
    const free = team?.freeInternalPeople ?? null;
    if (free === null) assumptions.push({ key: "free_internal_people_unknown" });
    workforce = {
      activePeople,
      perPersonDailyHours,
      workersNeeded,
      workerGap,
      partnerNeed: free === null ? null : Math.max(0, workerGap - Math.max(0, free)),
      absencePersonDaysBeforeDeadline: absencePersonDays,
      capacityHoursBeforeDeadline: capacityHours,
      capacityGapHours: round1(requiredHours - capacityHours),
    };
  }

  // ── cost ─────────────────────────────────────────────────────────────────
  const budgetCents = facts.economics?.budgetCents ?? null;
  const actualCostCents = facts.economics?.actualCostCents ?? null;
  let costPerHourCents: number | null = null;
  let forecastTotalCostCents: number | null = null;
  let possibleExtraCostCents: number | null = null;
  if (actualCostCents !== null && actualCostCents > 0 && totalHours !== null && totalHours > 0 && requiredHours !== null) {
    costPerHourCents = Math.round(actualCostCents / totalHours);
    forecastTotalCostCents = actualCostCents + Math.round(requiredHours * costPerHourCents);
    assumptions.push({ key: "cost_continues_at_observed_rate" });
    if (budgetCents !== null && budgetCents > 0) possibleExtraCostCents = forecastTotalCostCents - budgetCents;
  }

  const lateDays = risk === "likely_miss" || risk === "overdue" ? (slackDays !== null ? Math.max(0, -slackDays) : null) : risk === "unknown" ? null : 0;

  // ── prevention actions (only from facts that are present) ────────────────
  if (workforce.workerGap !== null && workforce.workerGap > 0) {
    actions.push({ key: "add_workers", value: workforce.workerGap });
    if (workforce.partnerNeed !== null && workforce.partnerNeed > 0) actions.push({ key: "find_partner_capacity", value: workforce.partnerNeed });
  }
  if (activePeople === 0 && workLeft && !actions.some((a) => a.key === "add_workers")) actions.push({ key: "add_workers", value: 1 });
  if (facts.stages && facts.stages.blocked > 0) actions.push({ key: "unblock_stages", value: facts.stages.blocked });
  if (facts.tasks && facts.tasks.blocked > 0) actions.push({ key: "unblock_tasks", value: facts.tasks.blocked });
  if (quality.seriousOpen !== null && quality.seriousOpen > 0) actions.push({ key: "close_serious_defects", value: quality.seriousOpen });
  if (facts.readiness && facts.readiness.workersWithMissingItems > 0) actions.push({ key: "complete_readiness", value: facts.readiness.workersWithMissingItems });
  if (hours && hours.basis === "none" && workLeft) actions.push({ key: "record_hours" });
  if (!plannedEnd && workLeft) actions.push({ key: "set_planned_end" });
  if (picked === null && facts.tasks !== null) actions.push({ key: "break_down_scope" });
  if (possibleExtraCostCents !== null && possibleExtraCostCents > 0) actions.push({ key: "review_budget", value: possibleExtraCostCents });
  if ((risk === "likely_miss" || risk === "overdue") && (workforce.workerGap === null || workforce.workerGap <= 0)) {
    actions.push({ key: "replan_deadline", value: lateDays ?? undefined });
  }

  // ── confidence ───────────────────────────────────────────────────────────
  let confidence: ForecastConfidence = "insufficient";
  if (completionDate !== null || requiredHours !== null) {
    let score = 0;
    if (unitDone !== null && unitDone >= ESTABLISHED_DONE_UNITS) score += 2;
    else if (unitDone !== null && unitDone >= MIN_DONE_UNITS) score += 1;
    if (method === "hours" || method === "done") {
      if (activeDays >= STEADY_ACTIVE_DAYS) score += 1;
      if (hours?.complete) score += 1;
      const confirmedShare =
        hours?.basis === "journal" && hours.confirmedHours !== null && (totalHours ?? 0) > 0
          ? hours.confirmedHours / (totalHours as number)
          : hours?.basis === "organization_ledger"
            ? 1
            : 0;
      if (confirmedShare >= 0.5) score += 1;
    }
    if (facts.tasks === null || facts.team === null) score -= 1;
    confidence = method === "done" ? "high" : score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  }

  const status: ProjectForecast["status"] = completionDate !== null || requiredHours !== null ? "ok" : "insufficient_data";

  return {
    ...base,
    status,
    remaining: { unit: picked?.unit ?? null, total: unitTotal, done: unitDone, remaining: remainingUnits },
    productivity: {
      hoursPerUnit,
      recentHoursPerUnit,
      trend,
      dailyHours,
      unitsPerDay,
      activeDaysInWindow: hours && hours.basis !== "none" ? activeDays : null,
    },
    requiredHours,
    completion: { date: completionDate, method, daysFromToday, beyondHorizon },
    deadline: { plannedEnd, slackDays, risk },
    workforce,
    quality,
    cost: { budgetCents, actualCostCents, costPerHourCents, forecastTotalCostCents, possibleExtraCostCents },
    losses: { lateDays, possibleExtraCostCents: possibleExtraCostCents !== null && possibleExtraCostCents > 0 ? possibleExtraCostCents : possibleExtraCostCents === null ? null : 0 },
    actions,
    confidence,
    assumptions,
  };
}
