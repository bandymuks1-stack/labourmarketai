/**
 * Worker-facing opportunity fit — pure, deterministic, NO score (doctrine §19).
 *
 * Given the worker's OWN profile facts and one open employer need, returns a
 * neutral status that tells the worker honestly where they stand. There is no
 * percentage, no ranking, no "AI match". When the profile lacks the basics we
 * say so plainly instead of inventing a fit.
 *
 * Honest statuses:
 *   - missing_profile_info — the profile is too thin to compare (no work type
 *     or no skills). The worker should complete their profile first.
 *   - needs_documents      — profile basics are there but no documents yet;
 *     most cross-border work needs them, so flag it as the next step.
 *   - check_conditions     — basics + docs present, but country doesn't line up
 *     or availability is unstated — worth checking the conditions.
 *   - possible_match       — work type, skills, documents, country and
 *     availability all line up enough to be a genuine possibility.
 */

export type OpportunityStatus =
  | "possible_match"
  | "missing_profile_info"
  | "needs_documents"
  | "check_conditions";

/** Short, neutral gap codes the UI can render as "what to check / fix". */
export type OpportunityGap =
  | "incomplete_profile"
  | "no_documents"
  | "country_mismatch"
  | "country_unknown"
  | "availability_unknown";

export interface WorkerOpportunityProfile {
  /** A sector / work type is set on the profile. */
  readonly hasWorkType: boolean;
  /** At least one skill is recorded. */
  readonly hasSkills: boolean;
  /** ISO-2 country codes the worker is in / targets (uppercased). */
  readonly countries: readonly string[];
  /** Availability is stated (status "available" or an available-from date). */
  readonly availabilitySet: boolean;
  /** Count of the worker's own documents. */
  readonly documentsCount: number;
}

export interface OpportunityNeed {
  readonly id: string;
  /** Employer's role / work-direction text (free text from the need). */
  readonly roleText: string | null;
  /** ISO-2 country of the need. */
  readonly country: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly accommodation: string | null;
}

export interface OpportunityFit {
  readonly status: OpportunityStatus;
  readonly gaps: readonly OpportunityGap[];
}

function countryFit(
  needCountry: string | null,
  countries: readonly string[],
): "match" | "mismatch" | "unknown" {
  if (!needCountry) return "unknown";
  if (countries.length === 0) return "unknown";
  return countries.includes(needCountry.toUpperCase()) ? "match" : "mismatch";
}

export function computeOpportunityFit(
  profile: WorkerOpportunityProfile,
  need: OpportunityNeed,
): OpportunityFit {
  const gaps: OpportunityGap[] = [];

  // 1) Too thin to compare at all.
  if (!profile.hasWorkType || !profile.hasSkills) {
    gaps.push("incomplete_profile");
    return { status: "missing_profile_info", gaps };
  }

  // 2) Basics there, but no documents yet.
  if (profile.documentsCount === 0) {
    gaps.push("no_documents");
    return { status: "needs_documents", gaps };
  }

  // 3) Country / availability checks.
  const cf = countryFit(need.country, profile.countries);
  if (cf === "mismatch") gaps.push("country_mismatch");
  else if (cf === "unknown") gaps.push("country_unknown");
  if (!profile.availabilitySet) gaps.push("availability_unknown");

  if (cf === "mismatch" || !profile.availabilitySet) {
    return { status: "check_conditions", gaps };
  }

  // 4) Everything that we can check lines up.
  return { status: "possible_match", gaps };
}

export const OPPORTUNITY_STATUSES: readonly OpportunityStatus[] = [
  "possible_match",
  "check_conditions",
  "needs_documents",
  "missing_profile_info",
];
