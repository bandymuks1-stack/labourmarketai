import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * BRIGADE AS A UNIT — resolving a team to its members, without inventing a
 * second workforce model and without inventing anybody's consent.
 *
 * THE GAP THIS CLOSES (B1). The product could already describe a brigade:
 * a brigade is an `organizations` row with `organization_type='team'`
 * (migration 20260705220000), its membership is the EXISTING
 * `engagement_contexts` employee relationship, `capacity-model.ts` already
 * carries `BrigadeInput`, `brigadeIds` per worker and a `brigade` gap kind,
 * and demand already carries a `teamShape`. What nothing did was answer the
 * one question a team act needs: IF this brigade were committed, what
 * happens to each of these actual people?
 *
 * ── NO SECOND WORKFORCE MODEL ──────────────────────────────────────────────
 *
 * There is no brigade entity here, no team roster store, no membership
 * table. This module takes members a caller has ALREADY read through the
 * existing team read and returns a verdict per person. A brigade is a way of
 * naming several workers at once; it is never a worker, and it can never
 * hold time, consent or authority of its own.
 *
 * ── A TEAM ACT IS NOT A TRANSACTION, AND MUST NOT LOOK LIKE ONE ────────────
 *
 * Nothing here writes. The plan this returns is meant to drive N INDEPENDENT
 * per-member writes through the authority that already exists
 * (`assign_worker_to_project`, `submit_agency_candidate_offer_v1`), each of
 * which can succeed or fail on its own. Presenting those N writes as one
 * atomic brigade commitment would be a lie about what the database did, and
 * a caller that lost three of eight members would never learn which three.
 * Atomic collective commitment is a different capability with its own
 * transactional RPC and its own authority question — deliberately not built
 * here, and this module gives no way to fake it.
 *
 * ── THREE DIMENSIONS, KEPT APART (SEP-7, SEP-8) ────────────────────────────
 *
 * AUTHORITY (may the caller commit this person), CONSENT (is the membership
 * backed by a recorded acceptance) and TIME (is their calendar free) are
 * different properties with different failure modes, so they are three
 * fields and never one boolean. Each carries its own UNKNOWN.
 *
 * UNKNOWN IS NOT NO, AND NEVER YES. A member whose authority could not be
 * determined is not refused; a member whose consent provenance is unreadable
 * is not un-consented; a member whose calendar could not be read is not free.
 * All three resolve to `unknown` eligibility — which is neither eligible nor
 * not-eligible, and which keeps the whole brigade out of the affirmative
 * answer. `wholeBrigadeEligible` is therefore false whenever ANY member is
 * unknown: a team answer built by treating silence as consent is exactly the
 * defect the capacity work spent this month removing.
 *
 * PURE. No IO, no clock, no Supabase. The time verdict is IMPORTED from
 * `commitment-reservation` rather than restated, so a brigade view and a
 * single-worker view can never disagree about what an overlap is.
 */

/** May the caller commit this member? `unknown` is not a refusal. */
export type MemberAuthority = "permitted" | "refused" | "unknown";

/**
 * Is this membership backed by a recorded acceptance?
 *
 * `not_recorded` is a REAL answer and a common one: the team read derives
 * provenance from the invitations ledger, and a member added before that
 * ledger existed genuinely has no recorded acceptance. It is not a failure
 * and it is not consent — which is why it blocks a team act rather than
 * being silently treated as agreement.
 */
export type MemberConsent = "recorded" | "not_recorded" | "unknown";

/** Neither eligible nor not-eligible: the third answer, kept as an answer. */
export type MemberEligibility = "eligible" | "not_eligible" | "unknown";

export interface BrigadeMemberInput {
  /** workers.id — opaque. No name, no email, no contact field. */
  readonly workerId: string;
  readonly authority: MemberAuthority;
  readonly consent: MemberConsent;
  /** The CAL-7 verdict for the window being proposed. */
  readonly time: ReservationVerdict;
}

export interface BrigadeMemberVerdict extends BrigadeMemberInput {
  readonly eligibility: MemberEligibility;
  /**
   * Why this member is not simply eligible. Empty when they are. Ordered
   * definite-first so a surface can lead with the answerable thing.
   */
  readonly reasons: readonly MemberBlockReason[];
}

export type MemberBlockReason =
  | "authority_refused"
  | "authority_unknown"
  | "consent_not_recorded"
  | "consent_unknown"
  | "time_collides"
  | "time_unknown";

export interface BrigadeAssignmentPlan {
  readonly brigadeId: string;
  readonly members: readonly BrigadeMemberVerdict[];
  readonly eligibleWorkerIds: readonly string[];
  readonly notEligibleWorkerIds: readonly string[];
  readonly unknownWorkerIds: readonly string[];
  /**
   * TRUE only when every member is AFFIRMATIVELY eligible. One unknown is
   * enough to make it false — the whole point of the field.
   */
  readonly wholeBrigadeEligible: boolean;
}

/** Definite blocks first, then the unknowns. Order is presentation-stable. */
function reasonsFor(m: BrigadeMemberInput): MemberBlockReason[] {
  const out: MemberBlockReason[] = [];
  if (m.authority === "refused") out.push("authority_refused");
  if (m.consent === "not_recorded") out.push("consent_not_recorded");
  if (m.time.state === "collides") out.push("time_collides");
  if (m.authority === "unknown") out.push("authority_unknown");
  if (m.consent === "unknown") out.push("consent_unknown");
  if (m.time.state === "unknown") out.push("time_unknown");
  return out;
}

function eligibilityFor(m: BrigadeMemberInput): MemberEligibility {
  // A DEFINITE no outranks an unknown: if authority is refused it does not
  // matter that the calendar could not be read.
  if (
    m.authority === "refused" ||
    m.consent === "not_recorded" ||
    m.time.state === "collides"
  ) {
    return "not_eligible";
  }
  if (
    m.authority === "unknown" ||
    m.consent === "unknown" ||
    m.time.state === "unknown"
  ) {
    return "unknown";
  }
  return "eligible";
}

/**
 * Resolve a brigade to a per-member plan.
 *
 * `members` are the people the caller already read through the existing team
 * membership read. An EMPTY brigade returns `wholeBrigadeEligible: false` —
 * a team with no members is not a team that can be committed, and answering
 * `true` for the empty case is the vacuous-truth bug that would let a caller
 * "assign" nobody and report success.
 */
export function planBrigadeAssignment(input: {
  readonly brigadeId: string;
  readonly members: readonly BrigadeMemberInput[];
}): BrigadeAssignmentPlan {
  const members: BrigadeMemberVerdict[] = input.members.map((m) => ({
    ...m,
    eligibility: eligibilityFor(m),
    reasons: reasonsFor(m),
  }));

  const pick = (e: MemberEligibility) =>
    members.filter((m) => m.eligibility === e).map((m) => m.workerId);

  const eligibleWorkerIds = pick("eligible");

  return {
    brigadeId: input.brigadeId,
    members,
    eligibleWorkerIds,
    notEligibleWorkerIds: pick("not_eligible"),
    unknownWorkerIds: pick("unknown"),
    wholeBrigadeEligible:
      members.length > 0 && eligibleWorkerIds.length === members.length,
  };
}
