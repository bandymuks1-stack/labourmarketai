import {
  computeOpportunityFit,
  type OpportunityNeed,
  type OpportunityStatus,
  type WorkerOpportunityProfile,
} from "@/lib/opportunities/opportunity-fit";

/**
 * Match Card view (full-completion train PR 3).
 *
 * Turns a worker profile + a company demand (need) into an HONEST, per-dimension
 * match breakdown the UI can render as a Match Card: which dimensions fit, which
 * need checking, and the neutral overall status. It NEVER produces a numeric
 * score, a percentage, or a "guaranteed match" — `possible_match` is the
 * strongest honest state and only means "everything we can check lines up".
 *
 * Reuses the existing deterministic `computeOpportunityFit` for the status +
 * gaps; the per-dimension signals are derived from the same real fields.
 *
 * Pure, deterministic, no DB, no external references.
 */

export type MatchSignalKey =
  | "workType"
  | "skills"
  | "country"
  | "availability"
  | "documents";

/** fit = the dimension lines up; check = needs attention; unknown = not enough
 *  data to say (never guessed as a fit). */
export type MatchSignalState = "fit" | "check" | "unknown";

export type MatchSignal = { key: MatchSignalKey; state: MatchSignalState };

export type MatchCardView = {
  status: OpportunityStatus;
  signals: MatchSignal[];
  /** True only for the strongest honest state — never a guarantee. */
  isPossibleMatch: boolean;
};

function countrySignal(
  needCountry: string | null,
  countries: readonly string[],
): MatchSignalState {
  if (!needCountry || countries.length === 0) return "unknown";
  return countries.includes(needCountry.toUpperCase()) ? "fit" : "check";
}

export function buildMatchCardView(
  profile: WorkerOpportunityProfile,
  need: OpportunityNeed,
): MatchCardView {
  const fit = computeOpportunityFit(profile, need);
  const signals: MatchSignal[] = [
    { key: "workType", state: profile.hasWorkType ? "fit" : "check" },
    { key: "skills", state: profile.hasSkills ? "fit" : "check" },
    { key: "country", state: countrySignal(need.country, profile.countries) },
    { key: "availability", state: profile.availabilitySet ? "fit" : "check" },
    { key: "documents", state: profile.documentsCount > 0 ? "fit" : "check" },
  ];
  return {
    status: fit.status,
    signals,
    isPossibleMatch: fit.status === "possible_match",
  };
}
