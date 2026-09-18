import type { EvidenceStanding } from "@/components/app/work-world/primitives";
import type { WorkVerificationState } from "@/lib/journal/work-verification-state";

/**
 * A journal entry's verification state, expressed in the ONE evidence-standing
 * vocabulary the work-world primitives colour by (`evidenceVariant`).
 *
 * The bridge exists so the Journal reads with the same grammar as identity,
 * history and demand — and so it can never overclaim:
 *
 *   · a manager's confirmation is the ORGANIZATION standing behind the record
 *     (`ORGANIZATION_ATTESTED`, champagne). It is NOT `INDEPENDENTLY_VERIFIED`
 *     (the only green): the confirmer belongs to the same organization the
 *     work was done for, exactly as `countsAsIndependentlyVerified` says.
 *   · a self-confirmation is `SELF_ATTESTED` (cyan evidence) — real, permanent,
 *     never a manager's word.
 *   · everything still waiting, unreachable or organization-less is the
 *     person's own record (`SELF_REPORTED`, cyan evidence).
 *   · returned / disputed are contested (amber) — the record is not withdrawn,
 *     it needs the worker's answer.
 *
 * Pure. Presentation only: no state here changes what the entry IS.
 */
export function evidenceStandingOfVerification(
  state: WorkVerificationState,
): EvidenceStanding {
  switch (state) {
    case "verified":
      return "ORGANIZATION_ATTESTED";
    case "self_confirmed":
      return "SELF_ATTESTED";
    case "returned":
      return "CORRECTED";
    case "disputed":
      return "DISPUTED";
    case "self_reported":
    case "verifier_not_identified":
    case "verifier_available":
    case "verification_pending":
    case "not_applicable":
      return "SELF_REPORTED";
  }
}

/** A spine node is drawn solid only once a real decision row exists behind
 *  the entry (a confirmation by someone, including the subject); every
 *  waiting state stays an outlined node. */
export function spineNodeSolid(state: WorkVerificationState): boolean {
  return state === "verified" || state === "self_confirmed";
}
