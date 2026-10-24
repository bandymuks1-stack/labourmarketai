import { daysBetween, isIsoDay, toIsoDay } from "./forecast-days";
import type { DeadlineRisk, ForecastConfidence, ForecastFacts, ProjectForecast, QualityRisk } from "./forecast-engine";

/**
 * FORECAST VERSIONS — what changed between two forecasts, and how wrong the
 * forecasts turned out once the actual is known. Pure.
 *
 * A stored forecast version is a FORECAST with its own provenance (version,
 * computed_at, engine version, inputs hash, sources, assumptions,
 * confidence). It is never edited and never read back as a fact (SEP-1): the
 * facts stay in their own tables; this is the record of what was SAID about
 * them, kept so it can be measured against what HAPPENED.
 */

// ── stable fingerprint of the facts a forecast was computed from ───────────

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** 64-bit FNV-1a over the canonical JSON of the facts — a fingerprint for
 *  "were these the same inputs?", not a security hash. */
export function factsFingerprint(facts: ForecastFacts): string {
  const s = stable(facts);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000197) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// ── comparison with the previous version ───────────────────────────────────

export interface ForecastComparison {
  readonly previousVersion: number;
  /** + = the completion date moved LATER, − = earlier; null = not comparable. */
  readonly completionShiftDays: number | null;
  readonly requiredHoursDelta: number | null;
  readonly deadlineRisk: { readonly from: DeadlineRisk; readonly to: DeadlineRisk } | null;
  readonly qualityRisk: { readonly from: QualityRisk; readonly to: QualityRisk } | null;
  readonly workerGapDelta: number | null;
  readonly possibleExtraCostDeltaCents: number | null;
  readonly confidence: { readonly from: ForecastConfidence; readonly to: ForecastConfidence } | null;
  /** true when the facts fingerprint is identical — the new version only
   *  reflects the passing of time. */
  readonly sameInputs: boolean;
}

const delta = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : Math.round((b - a) * 100) / 100;

export function compareForecasts(
  previous: { readonly version: number; readonly forecast: ProjectForecast; readonly inputsHash: string },
  next: { readonly forecast: ProjectForecast; readonly inputsHash: string },
): ForecastComparison {
  const p = previous.forecast;
  const n = next.forecast;
  return {
    previousVersion: previous.version,
    completionShiftDays:
      p.completion.date && n.completion.date ? daysBetween(p.completion.date, n.completion.date) : null,
    requiredHoursDelta: delta(p.requiredHours, n.requiredHours),
    deadlineRisk: p.deadline.risk !== n.deadline.risk ? { from: p.deadline.risk, to: n.deadline.risk } : null,
    qualityRisk: p.quality.risk !== n.quality.risk ? { from: p.quality.risk, to: n.quality.risk } : null,
    workerGapDelta: delta(p.workforce.workerGap, n.workforce.workerGap),
    possibleExtraCostDeltaCents: delta(p.cost.possibleExtraCostCents, n.cost.possibleExtraCostCents),
    confidence: p.confidence !== n.confidence ? { from: p.confidence, to: n.confidence } : null,
    sameInputs: previous.inputsHash === next.inputsHash,
  };
}

// ── actual vs forecast (error measurement) ─────────────────────────────────

export interface StoredForecastVersion {
  readonly version: number;
  readonly computedAt: string;
  readonly mode: string;
  readonly forecast: ProjectForecast;
}

export interface ForecastActual {
  /** The day the work actually finished. */
  readonly completedOn: string;
  /** Hours actually spent in total on the same ledger the forecasts used;
   *  null when not known. */
  readonly totalHours: number | null;
}

export interface VersionError {
  readonly version: number;
  readonly mode: string;
  /** Days between the forecast and the actual completion (lead time). */
  readonly leadDays: number;
  /** actual − forecast completion: + = finished LATER than forecast. */
  readonly completionErrorDays: number | null;
  /** (hours spent when forecast + required hours forecast) − actual total. */
  readonly totalHoursError: number | null;
}

export interface ForecastErrorSummary {
  readonly versions: readonly VersionError[];
  readonly measured: number;
  readonly meanAbsoluteCompletionErrorDays: number | null;
  /** Mean signed error: + = forecasts were optimistic on average. */
  readonly meanCompletionBiasDays: number | null;
  readonly meanAbsoluteHoursError: number | null;
}

/**
 * Measure every stored version against the actual. `hoursSpentAt(version)`
 * returns the hours already recorded when that version was computed (from
 * the version's stored facts summary); null when not stored.
 */
export function measureForecastError(
  versions: readonly StoredForecastVersion[],
  actual: ForecastActual,
  hoursSpentAt: (v: StoredForecastVersion) => number | null = () => null,
): ForecastErrorSummary {
  if (!isIsoDay(actual.completedOn)) {
    return { versions: [], measured: 0, meanAbsoluteCompletionErrorDays: null, meanCompletionBiasDays: null, meanAbsoluteHoursError: null };
  }
  const out: VersionError[] = [];
  for (const v of versions) {
    const computedDay = toIsoDay(v.computedAt);
    if (!computedDay || computedDay > actual.completedOn) continue; // computed after the fact: not a forecast of it
    const forecastDay = v.forecast.completion.date;
    const spent = hoursSpentAt(v);
    out.push({
      version: v.version,
      mode: v.mode,
      leadDays: daysBetween(computedDay, actual.completedOn),
      completionErrorDays: forecastDay ? daysBetween(forecastDay, actual.completedOn) : null,
      totalHoursError:
        actual.totalHours !== null && spent !== null && v.forecast.requiredHours !== null
          ? Math.round((spent + v.forecast.requiredHours - actual.totalHours) * 10) / 10
          : null,
    });
  }
  const dayErrs = out.map((e) => e.completionErrorDays).filter((e): e is number => e !== null);
  const hourErrs = out.map((e) => e.totalHoursError).filter((e): e is number => e !== null);
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  return {
    versions: out,
    measured: dayErrs.length,
    meanAbsoluteCompletionErrorDays: mean(dayErrs.map(Math.abs)),
    meanCompletionBiasDays: mean(dayErrs),
    meanAbsoluteHoursError: mean(hourErrs.map(Math.abs)),
  };
}

/**
 * The ACTUAL, once it is known: the first stored version whose facts show
 * nothing remaining carries the day the last unit was finished and the hours
 * spent. Null while work remains — an unfinished project has no actual yet.
 */
export function actualFromVersions(
  versions: readonly { readonly version: number; readonly factsSummary: Record<string, unknown> }[],
): ForecastActual | null {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  for (const v of sorted) {
    const s = v.factsSummary;
    if (s.unitsRemaining === 0 && typeof s.lastUnitCompletedOn === "string" && isIsoDay(s.lastUnitCompletedOn)) {
      return {
        completedOn: s.lastUnitCompletedOn,
        totalHours: typeof s.totalHours === "number" ? s.totalHours : null,
      };
    }
  }
  return null;
}
