import {
  isSelfConfirmation,
  type ConfirmationRow,
  type ReviewDecision,
} from "@/lib/journal/review-status";

/**
 * CONFIRMATION ORIGIN + PROOF CONCEPTS - pure read-side classification
 * (EVID-2 redesign, slice 1; migration 20261003150500).
 *
 * WHY THIS EXISTS. Confirmation authority derives from the WORK RELATIONSHIP:
 * the legitimate counterparty of the work (employer, client, customer,
 * contracting party) accepts it - not "somebody other than the author". The
 * database records WHICH relationship a row's authority came from
 * (`confirmation_scope.authority.basis`) and WHERE the row came from
 * (`confirmation_scope.provenance.origin`). This module is the one place that
 * turns those facts into proof concepts, so no surface re-derives them.
 *
 * DISTINCT PROOF CONCEPTS - NEVER ONE "verified" BOOLEAN:
 *
 *   SELF_DECLARED          the subject said it (incl. the subject's own old
 *                          self-confirmations - real rows, never counted)
 *   EVIDENCE_SUPPORTED     records back it (journal entries, documents)
 *   CLIENT_ACCEPTED        the client/customer/contracting counterparty
 *                          accepted it (basis 'counterparty')
 *   EMPLOYER_CONFIRMED     the employer confirmed it (basis 'employer')
 *   SUPERVISOR_CONFIRMED   reserved: no canonical source exists yet, so it is
 *                          never derived (the evidence_tier / provenance
 *                          precedent: leave a class out rather than fake it)
 *   INDEPENDENTLY_VERIFIED an independent verifier on the EVIDENCE side
 *                          (organization_evidence_events). Never derivable
 *                          from journal confirmation rows; supplied by the
 *                          caller only.
 *
 * A client acceptance is NOT an employer confirmation and does not make a
 * skill "verified": confirmed-work counters read `action === 'confirm'` and
 * counterparty rows carry `client_accept` / `client_request_correction` /
 * `client_dispute`.
 *
 * ORIGIN INVARIANTS (never relaxed):
 *   - a platform confirmation row is a platform action by a platform actor:
 *     RECONSTRUCTED_HISTORICAL_* is never a valid origin of such a row;
 *   - the technical actor (recorded_by / imported_by) is never the
 *     real-world confirmer (confirmed_by) by assumption - they are separate
 *     fields; an importer is never classified as the confirmer;
 *   - the five legacy self-confirmations carry no authority/provenance keys
 *     and are classified LEGACY_UNCLASSIFIED, never rewritten.
 */

export type ProofConcept =
  | "SELF_DECLARED"
  | "EVIDENCE_SUPPORTED"
  | "CLIENT_ACCEPTED"
  | "EMPLOYER_CONFIRMED"
  | "SUPERVISOR_CONFIRMED"
  | "INDEPENDENTLY_VERIFIED";

export type AuthorityBasis = "employer" | "counterparty";

export type ConfirmationOrigin =
  | "NATIVE_PLATFORM_EMPLOYER_CONFIRMATION"
  | "NATIVE_PLATFORM_CLIENT_CONFIRMATION"
  | "RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION"
  | "LEGACY_UNCLASSIFIED";

const KNOWN_ORIGINS: readonly ConfirmationOrigin[] = [
  "NATIVE_PLATFORM_EMPLOYER_CONFIRMATION",
  "NATIVE_PLATFORM_CLIENT_CONFIRMATION",
  "RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION",
];

interface ScopeShape {
  decision?: unknown;
  action?: unknown;
  authority?: { basis?: unknown } | null;
  provenance?: { origin?: unknown } | null;
}

function scopeOf(row: ConfirmationRow): ScopeShape {
  const s = row.confirmation_scope;
  return s && typeof s === "object" ? (s as ScopeShape) : {};
}

/** The authority basis recorded on the row; rows that predate the field are
 *  employer-path rows by construction (only the employer path existed). */
export function authorityBasisOf(row: ConfirmationRow): AuthorityBasis {
  return scopeOf(row).authority?.basis === "counterparty"
    ? "counterparty"
    : "employer";
}

export function originOf(row: ConfirmationRow): ConfirmationOrigin {
  const o = scopeOf(row).provenance?.origin;
  return typeof o === "string" &&
    (KNOWN_ORIGINS as readonly string[]).includes(o)
    ? (o as ConfirmationOrigin)
    : "LEGACY_UNCLASSIFIED";
}

function decisionOf(row: ConfirmationRow): ReviewDecision | null {
  const d = scopeOf(row).decision;
  return d === "approved" || d === "rejected" || d === "changes_requested"
    ? d
    : null;
}

/** True for a counterparty-basis row (client acceptance / correction / dispute). */
export function isCounterpartyRow(row: ConfirmationRow): boolean {
  return authorityBasisOf(row) === "counterparty";
}

/**
 * The proof concept ONE approving row supports, or null when the row is not an
 * approval. A row the subject wrote about themselves is SELF_DECLARED however
 * it was written. A RECONSTRUCTED origin can never reach this table; if one is
 * ever seen it is classified by what it is NOT - never as a native acceptance.
 */
export function conceptOfApprovalRow(
  row: ConfirmationRow,
  subjectProfileId: string | null | undefined,
): ProofConcept | null {
  if (decisionOf(row) !== "approved") return null;
  if (isSelfConfirmation(row, subjectProfileId)) return "SELF_DECLARED";
  if (originOf(row) === "RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION") {
    return "EVIDENCE_SUPPORTED";
  }
  return isCounterpartyRow(row) ? "CLIENT_ACCEPTED" : "EMPLOYER_CONFIRMED";
}

export interface ProofConceptInput {
  readonly confirmations?: readonly ConfirmationRow[] | null;
  readonly subjectProfileId?: string | null;
  /** Count of the subject's own journal entries backing the claim. */
  readonly journalEntries?: number | null;
  /** Caller-supplied from the EVIDENCE side (organization_evidence_events,
   *  event_type 'independently_verified'). Never inferred here. */
  readonly independentlyVerifiedEvidence?: boolean | null;
}

/**
 * The SET of distinct proof concepts that currently hold. A set, not a ladder:
 * CLIENT_ACCEPTED and EMPLOYER_CONFIRMED are different claims by different
 * parties, and neither implies the other.
 *
 * Latest-wins per authority basis: a later dispute / correction request by the
 * SAME basis withdraws that basis' concept; a later acceptance restores it.
 */
export function deriveProofConcepts(input: ProofConceptInput): ProofConcept[] {
  const out = new Set<ProofConcept>(["SELF_DECLARED"]);
  if (Math.max(0, Math.floor(input.journalEntries ?? 0)) > 0) {
    out.add("EVIDENCE_SUPPORTED");
  }
  const rows = [...(input.confirmations ?? [])].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return ta - tb;
  });
  for (const basis of ["employer", "counterparty"] as const) {
    const latest = [...rows]
      .reverse()
      .find((r) => authorityBasisOf(r) === basis && decisionOf(r) !== null);
    if (!latest) continue;
    const concept = conceptOfApprovalRow(latest, input.subjectProfileId);
    if (concept === "SELF_DECLARED") continue;
    if (concept) out.add(concept);
  }
  if (input.independentlyVerifiedEvidence === true) {
    out.add("INDEPENDENTLY_VERIFIED");
  }
  return [...out];
}

/** Violations of the origin invariants for one confirmation row's provenance
 *  block. Empty array = consistent. Used by tests and by any future importer
 *  preview; the database guard enforces the first rule itself. */
export function provenanceViolations(provenance: {
  origin?: unknown;
  recorded_by?: unknown;
  imported_by?: unknown;
  confirmed_by_profile_id?: unknown;
  imported_at?: unknown;
}): string[] {
  const v: string[] = [];
  const origin = provenance.origin;
  if (typeof origin === "string" && origin.startsWith("RECONSTRUCTED")) {
    // Allowed to EXIST as a concept (evidence-side import); never as a
    // platform confirmation row, and never with a platform confirmer.
    if (provenance.confirmed_by_profile_id) {
      v.push("reconstructed origin must not name a platform profile as the confirmer");
    }
    if (!provenance.imported_by || !provenance.imported_at) {
      v.push("reconstructed origin requires imported_by and imported_at");
    }
  } else {
    if (provenance.imported_by || provenance.imported_at) {
      v.push("a native platform confirmation has no importer");
    }
  }
  if (
    provenance.imported_by &&
    provenance.confirmed_by_profile_id &&
    provenance.imported_by === provenance.confirmed_by_profile_id
  ) {
    v.push("the importer must never be classified as the confirmer");
  }
  return v;
}
