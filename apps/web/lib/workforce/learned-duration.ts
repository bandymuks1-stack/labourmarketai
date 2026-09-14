/**
 * WHAT THIS KIND OF WORK ACTUALLY TAKES — the learning half of the flywheel
 * (CAL-10).
 *
 * The product records both halves already and never put them together. A
 * `project_stages` row carries `planned_start`/`planned_end` AND
 * `actual_start`/`actual_end`; every finished stage is therefore a measured
 * answer to "how long did this really take, against how long we said". What
 * was missing is the step that reads those answers back, so the next plan is
 * informed by the last ten instead of by nobody's memory.
 *
 * ── SEP-1: A FORECAST MAY NEVER BE STORED AS A FACT ────────────────────────
 *
 * Everything here is DERIVED, at read time, from rows the caller can already
 * see. Nothing is written, there is no cache, no "learned_durations" table and
 * there must never be one: the moment an estimate is persisted it acquires the
 * authority of a record, outlives the evidence it came from, and starts being
 * cited as what the work takes. The observations are the fact; this is a
 * reading of them, and it is recomputed every time.
 *
 * There is deliberately NO `predictedDays` field. The strongest thing this
 * file will say is "the last N comparable stages took a median of M days" —
 * a statement about the past, which the reader may use for the future.
 *
 * ── SPARSE EVIDENCE STAYS SPARSE ───────────────────────────────────────────
 *
 * Below `MIN_OBSERVATIONS` the medians are NULL and the count is reported on
 * its own. A "median" of two is not a median, and a number rendered next to a
 * planning field is read as guidance no matter how it is captioned. The
 * honest answer to "what does this take?" after two observations is "we have
 * seen it twice", and that is what comes back.
 *
 * Provenance rides with every estimate — how many observations, over what
 * span, and which rows — so a reader can always ask the number where it came
 * from.
 *
 * PURE. No IO, no clock, no date library. Dates are ISO calendar days and are
 * compared and differenced arithmetically.
 */

/** Below this, no median is reported — only the count. */
export const MIN_OBSERVATIONS = 3;
/** At or above this, the reading is called `established` rather than
 *  `indicative`. Still a reading, still never a promise. */
export const ESTABLISHED_OBSERVATIONS = 8;

/** One finished piece of work, measured. */
export interface DurationObservation {
  /** What kind of work this was — the grouping key, already normalized. */
  readonly key: string;
  /** The row this came from, so any number can be traced back. */
  readonly sourceId: string;
  /** Inclusive calendar days planned. Null when nobody planned dates. */
  readonly plannedDays: number | null;
  /** Inclusive calendar days it really took. */
  readonly actualDays: number;
  /** ISO day it finished, for the provenance span. */
  readonly completedOn: string | null;
}

export type LearnedConfidence = "insufficient" | "indicative" | "established";

export interface LearnedDuration {
  readonly key: string;
  /** The name as most recently written by a person — never a canonical form
   *  this module invented. */
  readonly displayName: string;
  readonly observations: number;
  readonly confidence: LearnedConfidence;
  /** Null below MIN_OBSERVATIONS. Never a single observation dressed up. */
  readonly medianActualDays: number | null;
  /** Null below MIN_OBSERVATIONS, and null when no observation had a plan. */
  readonly medianPlannedDays: number | null;
  /**
   * Median of the per-observation actual ÷ planned ratios — computed per
   * observation and then taken as a median, NOT as a ratio of the two
   * medians, which would silently pair a planned figure from one stage with
   * an actual from another.
   */
  readonly medianRatio: number | null;
  /** How many observations carried a plan to compare against. */
  readonly comparedObservations: number;
  readonly firstObservedOn: string | null;
  readonly lastObservedOn: string | null;
  readonly sourceIds: readonly string[];
}

/** ISO "YYYY-MM-DD" → days since epoch. Returns null for anything else. */
function isoToDayNumber(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return Number.isNaN(utc) ? null : Math.round(utc / 86_400_000);
}

/**
 * Inclusive calendar-day span, the same counting the planning surfaces use:
 * a stage that starts and ends on the same day took ONE day, not zero.
 * Null when either end is missing or the range runs backwards — a reversed
 * range is a data problem, not a negative duration.
 */
export function inclusiveDaySpan(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const a = isoToDayNumber(start);
  const b = isoToDayNumber(end);
  if (a === null || b === null || b < a) return null;
  return b - a + 1;
}

/**
 * The grouping key for "the same kind of work".
 *
 * Stage names are free text written by managers, so this is casefolding and
 * whitespace collapse and NOTHING else. No stemming, no synonym table, no
 * fuzzy match: guessing that "Foundations" and "Foundation works" are the
 * same kind of work would silently merge two different bodies of evidence,
 * and the person reading the number would have no way to tell. Returns null
 * for a name too short to group on.
 */
export function durationKey(name: string | null | undefined): string | null {
  const normalized = (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length >= 2 ? normalized : null;
}

/** Median of a non-empty numeric list; even counts average the middle two. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

function confidenceFor(observations: number): LearnedConfidence {
  if (observations >= ESTABLISHED_OBSERVATIONS) return "established";
  if (observations >= MIN_OBSERVATIONS) return "indicative";
  return "insufficient";
}

/**
 * Group observations by key and read each group back.
 *
 * `displayNameByKey` carries the human spelling to render — supplied by the
 * caller from the most recent row, because this module must not decide what
 * a body of work is called.
 */
export function learnDurations(
  observations: readonly DurationObservation[],
  displayNameByKey: ReadonlyMap<string, string>,
): readonly LearnedDuration[] {
  const byKey = new Map<string, DurationObservation[]>();
  for (const o of observations) {
    const bucket = byKey.get(o.key);
    if (bucket) bucket.push(o);
    else byKey.set(o.key, [o]);
  }

  const out: LearnedDuration[] = [];
  for (const [key, group] of byKey) {
    const confidence = confidenceFor(group.length);
    const withPlan = group.filter((o) => o.plannedDays !== null && o.plannedDays > 0);
    const days = group.map((o) => o.completedOn).filter((d): d is string => Boolean(d)).sort();
    const enough = confidence !== "insufficient";
    out.push({
      key,
      displayName: displayNameByKey.get(key) ?? key,
      observations: group.length,
      confidence,
      // Sparse stays sparse: the count is the answer until there is a body
      // of evidence to take a middle of.
      medianActualDays: enough ? median(group.map((o) => o.actualDays)) : null,
      medianPlannedDays: enough ? median(withPlan.map((o) => o.plannedDays as number)) : null,
      medianRatio: enough
        ? median(
            withPlan.map(
              (o) => Math.round((o.actualDays / (o.plannedDays as number)) * 100) / 100,
            ),
          )
        : null,
      comparedObservations: withPlan.length,
      firstObservedOn: days[0] ?? null,
      lastObservedOn: days[days.length - 1] ?? null,
      // Deterministic, so the same evidence renders identically twice.
      sourceIds: group.map((o) => o.sourceId).sort(),
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
