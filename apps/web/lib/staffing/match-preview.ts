/**
 * ⛔ DEPRECATED — FROZEN LEGACY FORK (Wagon 4). Part of the frozen
 * lib/staffing/fit.ts preview path — see the header there. No new imports
 * (guard: lib/guards/staffing-fit-frozen.test.ts); new matching work goes to
 * lib/market/match-v1.ts.
 *
 * Match preview — PURE core (Staffing Operating Model v1, PR8).
 *
 * Turns a worker intake + a company need into a NON-PERSISTED preview: the
 * deterministic fit (computeStaffingFit), an honest dimension SCORE (a count of
 * fit/mismatch/unknown dimensions — NOT a fabricated percentage or AI score),
 * and the input for the matching_explanation agent (which explains, never
 * decides). Nothing here books, persists, or contacts anyone.
 *
 * Pure. No IO.
 */
import { z } from "zod";
import type { WorkerIntake } from "./worker-intake";
import type { CompanyNeed } from "./company-need";
import { computeStaffingFit, type StaffingFit } from "./fit";
import { matchingExplanationInputSchema } from "../ai/registry/agents/matching-explanation";

export interface MatchScore {
  readonly fit: number;
  readonly mismatch: number;
  readonly unknown: number;
  readonly total: number;
}

/** Count fit dimensions by verdict — honest, deterministic; never a % or AI score. */
export function matchFitScore(fit: StaffingFit): MatchScore {
  let f = 0;
  let m = 0;
  let u = 0;
  for (const d of fit.dimensions) {
    if (d.verdict === "fit") f += 1;
    else if (d.verdict === "mismatch") m += 1;
    else u += 1;
  }
  return { fit: f, mismatch: m, unknown: u, total: fit.dimensions.length };
}

export interface MatchPreview {
  readonly fit: StaffingFit;
  readonly score: MatchScore;
  /** Honest: mismatches are blockers, surfaced not hidden. */
  readonly blockers: readonly string[];
}

export function buildMatchPreview(
  worker: WorkerIntake,
  need: CompanyNeed,
): MatchPreview {
  const fit = computeStaffingFit(worker, need);
  return { fit, score: matchFitScore(fit), blockers: fit.blockers };
}

/** Build the matching_explanation agent input from a worker + need + fit. */
export function buildMatchingExplanationInput(
  worker: WorkerIntake,
  need: CompanyNeed,
  fit: StaffingFit,
): z.infer<typeof matchingExplanationInputSchema> {
  const blockers = fit.dimensions
    .filter((d) => d.verdict === "mismatch")
    .map((d) => d.detail);
  return matchingExplanationInputSchema.parse({
    workerSkills: worker.profession ? [worker.profession] : [],
    workEvidence: undefined,
    availability: worker.availableFrom,
    countryReadiness: blockers.slice(0, 50),
    companyNeed:
      need.profession + " in " + need.country + " — " + need.description.slice(0, 2000),
    bookingDates: need.startDate,
    accommodation:
      "worker:" + worker.accommodation + " / company:" + need.accommodationOffer,
    transport:
      "worker:" + worker.transport + " / company:" + (need.transportProvided ? "provided" : "none"),
    language: need.languageRequirements.join(", ") || undefined,
  });
}
