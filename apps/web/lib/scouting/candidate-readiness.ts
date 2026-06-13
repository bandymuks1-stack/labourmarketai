/**
 * Company-facing candidate readiness SIGNAL (Stage 7) — pure, no IO.
 *
 * Adds honest readiness signals to the scouting candidate card from data the
 * company may ALREADY safely see (the anonymized profile-safe preview + the
 * need's country). It NEVER claims document-level readiness: a company cannot
 * see a worker's private documents (RLS owner+admin only), so the document
 * summary is `consent_required` until the worker shares it — never a fake
 * "ready" / "missing" doc claim.
 *
 * Honest labels (subset of §3.1 that does not require doc visibility):
 *   - can_be_considered      — country + availability fit look right;
 *   - limited_information    — a partial fit (e.g. no stated availability);
 *   - not_enough_information — neither country nor availability signal.
 */

import type { WorkerShortlistSafePreview } from "@/lib/visibility/worker-profile-visibility";

export type CountryFit = "match" | "maybe" | "mismatch" | "unknown";

export type CompanyCandidateLabel =
  | "can_be_considered"
  | "limited_information"
  | "not_enough_information";

/** Document readiness is gated behind the worker's consent — never leaked. */
export type DocsSummaryState = "consent_required";

export interface CompanyCandidateReadiness {
  readonly countryFit: CountryFit;
  readonly availabilityFit: boolean;
  readonly label: CompanyCandidateLabel;
  readonly docsSummary: DocsSummaryState;
}

function deriveCountryFit(
  needCountry: string | null | undefined,
  preview: Pick<WorkerShortlistSafePreview, "preferredCountries" | "location">,
): CountryFit {
  if (!needCountry) return "unknown";
  const prefs = preview.preferredCountries ?? [];
  if (prefs.includes(needCountry) || preview.location === needCountry) {
    return "match";
  }
  if (prefs.length === 0 && !preview.location) return "maybe";
  return "mismatch";
}

export function companyCandidateReadiness(
  needCountry: string | null | undefined,
  preview: Pick<
    WorkerShortlistSafePreview,
    "preferredCountries" | "location" | "availability" | "availableFrom"
  >,
): CompanyCandidateReadiness {
  const countryFit = deriveCountryFit(needCountry, preview);
  const availabilityFit =
    preview.availability === "available" || Boolean(preview.availableFrom);

  let label: CompanyCandidateLabel;
  if (availabilityFit && (countryFit === "match" || countryFit === "maybe")) {
    label = "can_be_considered";
  } else if (!availabilityFit && (countryFit === "unknown" || countryFit === "mismatch")) {
    label = "not_enough_information";
  } else {
    label = "limited_information";
  }

  return { countryFit, availabilityFit, label, docsSummary: "consent_required" };
}
