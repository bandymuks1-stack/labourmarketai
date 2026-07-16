/**
 * ⛔ DEPRECATED — FROZEN LEGACY FORK (Explainable Matching v1, Wagon 4;
 * consolidation safety directive 2026-07-16).
 *
 * This 5-dimension fit is a PARALLEL engine to the canonical
 * `lib/market/match-v1.ts` (matchWorkerToNeed). It survives ONLY because the
 * marketing-preview page `/match-preview` uses its own standalone intake
 * schema (workerIntakeSchema / companyNeedSchema) that does not map onto the
 * canonical MatchNeed/MatchSubject shapes, so re-pointing was judged
 * disproportionate. The fork is FROZEN:
 *   - NO new imports of this module are allowed anywhere
 *     (guard: lib/guards/staffing-fit-frozen.test.ts — allowlist is the
 *     existing callers only);
 *   - NO new dimensions/behaviour may be added here — extend
 *     lib/market/match-v1.ts instead;
 *   - removal is a recorded bounded cleanup (retire /match-preview or
 *     re-point it to the canonical engine shape).
 *
 * Staffing fit engine (Staffing Operating Model v1, PR6).
 *
 * Deterministic, honest fit between a worker intake and a company need across the
 * real blockers: profession, accommodation, transport, language, start date.
 * This is NOT AI — it is the matching engine's logic. The `matching_explanation`
 * AI agent EXPLAINS this output; it never replaces it. Mismatches are NEVER
 * hidden — every one is surfaced as a blocker.
 *
 * Pure. No IO.
 */
import type { WorkerIntake } from "./worker-intake";
import type { CompanyNeed } from "./company-need";

export type FitVerdict = "fit" | "mismatch" | "unknown";

export const FIT_DIMENSIONS = [
  "profession",
  "accommodation",
  "transport",
  "language",
  "start_date",
] as const;
export type FitDimensionKey = (typeof FIT_DIMENSIONS)[number];

export interface FitDimension {
  readonly dimension: FitDimensionKey;
  readonly verdict: FitVerdict;
  readonly detail: string;
}

export interface StaffingFit {
  readonly dimensions: readonly FitDimension[];
  /** Every mismatch, surfaced honestly — never hidden. */
  readonly blockers: readonly string[];
  /** Advisory only (not a verdict of record): no mismatch on any dimension. */
  readonly noBlockers: boolean;
}

function professionFit(w: WorkerIntake, n: CompanyNeed): FitDimension {
  if (w.profession === n.profession) {
    return { dimension: "profession", verdict: "fit", detail: "same trade: " + n.profession };
  }
  return {
    dimension: "profession",
    verdict: "mismatch",
    detail: "worker trade " + w.profession + " differs from needed " + n.profession,
  };
}

function accommodationFit(w: WorkerIntake, n: CompanyNeed): FitDimension {
  const workerNeeds = w.accommodation === "needs_accommodation" || w.accommodation === "needs_help_finding";
  const companyProvides = n.accommodationOffer !== "not_provided";
  if (w.accommodation === "has_own_accommodation") {
    return { dimension: "accommodation", verdict: "fit", detail: "worker has own accommodation" };
  }
  if (workerNeeds && !companyProvides) {
    return {
      dimension: "accommodation",
      verdict: "mismatch",
      detail: "worker needs accommodation; company provides none",
    };
  }
  if (workerNeeds && companyProvides) {
    return { dimension: "accommodation", verdict: "fit", detail: "company provides accommodation" };
  }
  return { dimension: "accommodation", verdict: "unknown", detail: "accommodation not fully specified" };
}

function transportFit(w: WorkerIntake, n: CompanyNeed): FitDimension {
  if (w.transport === "has_transport" || w.transport === "has_driving_licence") {
    return { dimension: "transport", verdict: "fit", detail: "worker has own transport" };
  }
  if (w.transport === "needs_pickup" && !n.transportProvided) {
    return {
      dimension: "transport",
      verdict: "mismatch",
      detail: "worker needs pickup; company provides no transport",
    };
  }
  if (w.transport === "needs_pickup" && n.transportProvided) {
    return { dimension: "transport", verdict: "fit", detail: "company provides transport" };
  }
  return { dimension: "transport", verdict: "unknown", detail: "transport not specified" };
}

function languageFit(w: WorkerIntake, n: CompanyNeed): FitDimension {
  if (n.languageRequirements.length === 0) {
    return { dimension: "language", verdict: "fit", detail: "no language requirement" };
  }
  const workerLangs = new Set(w.languages.map((l) => l.toLowerCase()));
  const meets = n.languageRequirements.some((l) => workerLangs.has(l.toLowerCase()));
  if (meets) {
    return { dimension: "language", verdict: "fit", detail: "worker meets a required language" };
  }
  if (n.acceptsNonEnglish) {
    return {
      dimension: "language",
      verdict: "unknown",
      detail: "required language not evidenced, but company accepts non-English",
    };
  }
  return {
    dimension: "language",
    verdict: "mismatch",
    detail: "required language not evidenced and company does not accept non-English",
  };
}

function startDateFit(w: WorkerIntake, n: CompanyNeed): FitDimension {
  if (!w.availableFrom || !n.startDate) {
    return { dimension: "start_date", verdict: "unknown", detail: "start/availability date missing" };
  }
  // ISO dates compare lexicographically; "immediately" sorts before any date.
  const available = w.availableFrom === "immediately" ? "0000-00-00" : w.availableFrom;
  if (available <= n.startDate) {
    return { dimension: "start_date", verdict: "fit", detail: "available by the start date" };
  }
  return {
    dimension: "start_date",
    verdict: "mismatch",
    detail: "worker available " + w.availableFrom + " after start " + n.startDate,
  };
}

/** Compute the honest fit between a worker intake and a company need. */
export function computeStaffingFit(w: WorkerIntake, n: CompanyNeed): StaffingFit {
  const dimensions = [
    professionFit(w, n),
    accommodationFit(w, n),
    transportFit(w, n),
    languageFit(w, n),
    startDateFit(w, n),
  ];
  const blockers = dimensions
    .filter((d) => d.verdict === "mismatch")
    .map((d) => d.detail);
  return { dimensions, blockers, noBlockers: blockers.length === 0 };
}
