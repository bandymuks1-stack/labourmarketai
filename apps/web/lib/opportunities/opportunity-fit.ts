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
  /** Work-type slug (structured) — NEVER free text. */
  readonly roleText: string | null;
  /** ISO-2 country of the need. */
  readonly country: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly accommodation: string | null;
  /** Display name of the APPROVED supply company/partner, only when it is safe
   *  to show (i.e. the need arrived through an approved route). Null otherwise —
   *  an unapproved employer's identity is never exposed to a worker. */
  readonly companyName?: string | null;
  /** Coarse place label of the demand (city/region granularity — never an
   *  address), from the location-label RPC column when applied (PR8). */
  readonly locationLabel?: string | null;
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

// ── Worker next action (Worker Opportunity Board, PR5) ──────────────────────

/** The ONE next step shown on a worker's opportunity card. There is
 *  deliberately NO apply/contact action — no worker-initiated contact flow
 *  exists yet, and a fake CTA is worse than none (§18). */
export type WorkerNextAction =
  | "add_work_evidence" // no skills yet → the Work Journal is the evidence spine
  | "complete_profile" // profile too thin to compare
  | "review_opportunity" // the need itself is not derivable — read it, decide
  | "review_match"; // everything comparable — review the match details

export function workerOpportunityNextAction(input: {
  readonly profileFitStatus: OpportunityStatus;
  readonly hasAnySkill: boolean;
  readonly matchStatus: "strong" | "possible" | "weak" | "insufficient_data";
}): WorkerNextAction {
  if (!input.hasAnySkill) return "add_work_evidence";
  if (input.profileFitStatus === "missing_profile_info") return "complete_profile";
  if (input.matchStatus === "insufficient_data") return "review_opportunity";
  return "review_match";
}

// ── Worker Opportunities v1 — approved-route gate (default-closed) ───────────
//
// A worker only ever sees a need that arrived through an APPROVED supply route.
// These are the worker-visible route statuses; everything else (not_reviewed,
// documents_requested, limited_access, risk_flagged, blocked, …) is hidden.

export const WORKER_VISIBLE_ROUTE_STATUSES: readonly string[] = [
  "approved_direct_partner",
  "trusted_partner",
  "works_through_approved_route",
  "our_operating_company_approved",
];

/**
 * Whether an open-demand row is worker-visible. TRUE only when the row carries
 * an explicit approved-route signal. The current RPC does not yet expose one,
 * so this is false for every real row today (default-closed: no raw employer
 * need reaches a worker). It lights up once the approved-route migration adds
 * `approved_route` / `route_status`.
 */
export function isApprovedRouteRow(row: Record<string, unknown>): boolean {
  if (row.approved_route === true) return true;
  const status = typeof row.route_status === "string" ? row.route_status : null;
  return status !== null && WORKER_VISIBLE_ROUTE_STATUSES.includes(status);
}

/** The approved company/partner name is read ONLY from the dedicated safe RPC
 *  column (present only for approved routes) — never from free text. */
export function safeApprovedCompanyName(row: Record<string, unknown>): string | null {
  return typeof row.company_name === "string" && row.company_name.trim() !== ""
    ? row.company_name
    : null;
}
