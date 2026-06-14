/**
 * Operator candidate pool — PURE core (Staffing Operating Model v1, PR7).
 *
 * Honest status derivation + filtering over the existing worker supply (read
 * from `workers`/`worker_skills`/journal via the matching-workbench loader). No
 * IO, no server-only: unit-tested directly. Nothing here verifies anyone — a
 * confirmed-evidence badge means manager-confirmed journal/skill rows EXIST, not
 * that the person is "verified". Missing data is surfaced as "missing info".
 */

/** Structural subset of the matching-workbench SupplyWorkerRow we operate on. */
export interface CandidateInput {
  readonly id: string;
  readonly profileId?: string | null;
  readonly displayName: string | null;
  readonly headline: string | null;
  readonly availableFrom: string | null;
  readonly availabilityStatus: string | null;
  readonly locationCountry: string | null;
  readonly preferredCountries: readonly string[];
  readonly experienceYears: number | null;
  readonly professionSlugs: readonly string[];
  readonly skillsDeclared: number;
  readonly skillsConfirmed: number;
  readonly journalEntries: number;
  readonly managerConfirmations: number;
}

export type EvidenceStatus =
  | "confirmed_evidence"
  | "self_declared"
  | "missing_info";

export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  "confirmed_evidence",
  "self_declared",
  "missing_info",
];

/** Honest evidence status — never "verified". */
export function candidateEvidenceStatus(c: CandidateInput): EvidenceStatus {
  if (c.skillsConfirmed > 0 || c.managerConfirmations > 0) return "confirmed_evidence";
  if (c.skillsDeclared > 0 || c.journalEntries > 0) return "self_declared";
  return "missing_info";
}

/** What the candidate's profile is missing for staffing decisions. */
export function candidateMissingFields(c: CandidateInput): string[] {
  const missing: string[] = [];
  if (c.professionSlugs.length === 0) missing.push("profession");
  if (!c.availableFrom && !c.availabilityStatus) missing.push("availability");
  if (!c.locationCountry && c.preferredCountries.length === 0) missing.push("country");
  return missing;
}

export interface CandidateView extends CandidateInput {
  readonly evidenceStatus: EvidenceStatus;
  readonly missingFields: readonly string[];
}

export function toCandidateView(c: CandidateInput): CandidateView {
  return {
    ...c,
    evidenceStatus: candidateEvidenceStatus(c),
    missingFields: candidateMissingFields(c),
  };
}

export interface CandidateFilters {
  /** Profession slug (exact). */
  readonly profession?: string;
  /** ISO-2 country — matches the candidate's location OR preferred countries. */
  readonly country?: string;
  /** Available on or before this ISO date. */
  readonly availableBy?: string;
  readonly evidence?: "any" | EvidenceStatus;
  /** Free text over display name / headline. */
  readonly search?: string;
}

function availableByOk(c: CandidateInput, byDate: string): boolean {
  if (!c.availableFrom) return false; // unknown availability never claims "fits"
  const from = c.availableFrom === "immediately" ? "0000-00-00" : c.availableFrom;
  return from <= byDate;
}

export function filterCandidates(
  views: readonly CandidateView[],
  filters: CandidateFilters,
): CandidateView[] {
  const country = filters.country?.toUpperCase();
  const search = filters.search?.trim().toLowerCase();
  return views.filter((c) => {
    if (filters.profession && !c.professionSlugs.includes(filters.profession)) return false;
    if (country) {
      const inLoc = (c.locationCountry ?? "").toUpperCase() === country;
      const inPref = c.preferredCountries.some((p) => p.toUpperCase() === country);
      if (!inLoc && !inPref) return false;
    }
    if (filters.availableBy && !availableByOk(c, filters.availableBy)) return false;
    if (filters.evidence && filters.evidence !== "any" && c.evidenceStatus !== filters.evidence) {
      return false;
    }
    if (search) {
      const hay = `${c.displayName ?? ""} ${c.headline ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/** Distinct professions + countries present in the pool (for filter dropdowns). */
export function candidatePoolFacets(views: readonly CandidateView[]): {
  professions: string[];
  countries: string[];
} {
  const professions = new Set<string>();
  const countries = new Set<string>();
  for (const c of views) {
    c.professionSlugs.forEach((p) => professions.add(p));
    if (c.locationCountry) countries.add(c.locationCountry.toUpperCase());
    c.preferredCountries.forEach((p) => countries.add(p.toUpperCase()));
  }
  return {
    professions: [...professions].sort(),
    countries: [...countries].sort(),
  };
}
