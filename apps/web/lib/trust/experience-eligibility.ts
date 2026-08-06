/**
 * Experience-record eligibility contract (marketplace precision programme
 * PR 6; canonical contract §5 — docs/launch/marketplace-precision-booking-canonical-contract-v1.md).
 *
 * §19 RECONCILIATION RESOLVED (2026-08-06, recorded in
 * docs/audits/W6_EXPERIENCE_SURFACE_CURRENT_TRUTH.md §5 Q12): the owner
 * approved the "Fit, ne reitingas" doctrine — subjective positive/negative
 * experience only, no stars, no numeric score, no universal rank,
 * author-vs-subject separated, moderation always, response right, dispute
 * separate, count-only public consumption. The W6 surface implementing it is
 * SHIPPED (`?result=experiences`, lib/trust/experience-*, the /dashboard/admin
 * moderation band). The original header here read "OWNER_DECISION_GATED — no
 * UI, no storage, no route may render or persist experience records"; that
 * sentence predates the decision and is retired BY THIS EDIT, not silently —
 * the audit document above records the reconciliation. The doctrine this
 * contract encodes (unchanged):
 *
 *   - an experience record is a STRUCTURED FACTUAL account of a real,
 *     completed interaction — dimension chips + bounded text;
 *   - NO numeric person score exists anywhere: no stars, no 0-100, no
 *     averages. Aggregation is a transparent record COUNT only;
 *   - "insufficient data" renders as absence — never a 0 or an empty score;
 *   - publication ALWAYS passes moderation (submitted → in_moderation →
 *     published | rejected) with a reviewed-party right of reply;
 *   - compensation-accuracy statements carry mandatory moderation and are
 *     factual experience fields, never accusations published automatically.
 *
 * Eligibility truth sources are the CANONICAL interaction records only:
 * accepted bookings (booking_requests), ended engagements
 * (engagement_contexts), concluded service requests
 * (service_offering_requests). Nothing here invents an interaction.
 *
 * Pure module: no IO, deterministic, fully guard-tested.
 */

export const EXPERIENCE_CONTRACT_VERSION = 1 as const;

/** The only interaction kinds that can ever ground an experience record. */
export const ELIGIBLE_INTERACTION_KINDS = [
  "accepted_booking",
  "completed_engagement",
  "concluded_service_request",
] as const;
export type EligibleInteractionKind = (typeof ELIGIBLE_INTERACTION_KINDS)[number];

/** Structured dimensions — factual chips, NEVER numeric scores. */
export const EXPERIENCE_DIMENSIONS = [
  "punctuality_reliability",
  "communication",
  "work_quality",
  "condition_accuracy",
  "compensation_accuracy",
  "accommodation_accuracy",
  "transport_accuracy",
] as const;
export type ExperienceDimension = (typeof EXPERIENCE_DIMENSIONS)[number];

/** Dimension outcome vocabulary — descriptive, not a scale that averages
 *  into a rating (deliberately unordered wording). */
export const DIMENSION_OUTCOMES = ["as_agreed", "minor_issues", "not_as_agreed"] as const;

/** Dimensions that require moderation + legal-risk review before ANY
 *  publication (the record cannot skip in_moderation even if a future
 *  fast-path exists for others). */
export const LEGAL_REVIEW_DIMENSIONS: readonly ExperienceDimension[] = [
  "compensation_accuracy",
];

export const MODERATION_STATES = [
  "submitted",
  "in_moderation",
  "published",
  "rejected",
] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/** The moderation state machine — the ONLY legal transitions. There is no
 *  submitted→published shortcut: everything passes moderation. */
const MODERATION_TRANSITIONS: Record<ModerationState, readonly ModerationState[]> = {
  submitted: ["in_moderation"],
  in_moderation: ["published", "rejected"],
  published: [],
  rejected: [],
};

export function canTransitionModeration(
  from: ModerationState,
  to: ModerationState,
  actor: "author" | "moderator",
): boolean {
  if (!MODERATION_TRANSITIONS[from]?.includes(to)) return false;
  // Only a moderator moves a record — the author can neither self-publish
  // nor self-reject (withdrawal-before-moderation is a delete, not a state).
  return actor === "moderator";
}

// ── Eligibility ──────────────────────────────────────────────────────────────

export type InteractionFacts = {
  kind: EligibleInteractionKind;
  /** Canonical row id (booking_requests / engagement_contexts /
   *  service_offering_requests). */
  interactionId: string;
  /** Profile ids of the two real parties of the interaction. */
  partyA: string;
  partyB: string;
  /** Interaction status in its canonical table. */
  status: string;
  /** For bookings: the agreed start date (ISO date). An accepted booking
   *  grounds a record only from its start date on — before the work could
   *  even begin there is nothing to recount. */
  startDateIso?: string | null;
  /** For engagements: the end timestamp; null = still active. */
  endedAtIso?: string | null;
};

export type ExistingRecordRef = {
  authorProfileId: string;
  subjectProfileId: string;
  interactionKind: EligibleInteractionKind;
  interactionId: string;
};

export type EligibilityDenial =
  | "self_review"
  | "not_a_party"
  | "interaction_not_completed"
  | "duplicate_for_interaction"
  | "unknown_interaction_kind";

export type EligibilityResult =
  | { eligible: true; kind: EligibleInteractionKind; interactionId: string }
  | { eligible: false; reason: EligibilityDenial };

/** Interaction completion truth per kind — conservative: anything not
 *  provably completed is NOT eligible (fail closed, never fabricate). */
export function isInteractionCompleted(
  facts: InteractionFacts,
  nowIso: string,
): boolean {
  switch (facts.kind) {
    case "accepted_booking":
      return (
        facts.status === "accepted" &&
        typeof facts.startDateIso === "string" &&
        facts.startDateIso.length > 0 &&
        facts.startDateIso <= nowIso.slice(0, 10)
      );
    case "completed_engagement":
      return typeof facts.endedAtIso === "string" && facts.endedAtIso.length > 0;
    case "concluded_service_request":
      return facts.status === "accepted";
    default:
      return false;
  }
}

/**
 * The single eligibility decision. Rules (goal spec Capability G):
 *  - author and subject must be the two REAL parties of the interaction;
 *  - reviewing oneself is impossible;
 *  - the interaction must be completed (see isInteractionCompleted);
 *  - exactly ONE record per (author, subject, interaction) — a second
 *    attempt for the same context is a duplicate.
 */
export function deriveReviewEligibility(args: {
  authorProfileId: string;
  subjectProfileId: string;
  interaction: InteractionFacts;
  existingRecords: readonly ExistingRecordRef[];
  nowIso: string;
}): EligibilityResult {
  const { authorProfileId, subjectProfileId, interaction, existingRecords, nowIso } =
    args;

  if (!ELIGIBLE_INTERACTION_KINDS.includes(interaction.kind)) {
    return { eligible: false, reason: "unknown_interaction_kind" };
  }
  if (authorProfileId === subjectProfileId) {
    return { eligible: false, reason: "self_review" };
  }
  const parties = [interaction.partyA, interaction.partyB];
  if (!parties.includes(authorProfileId) || !parties.includes(subjectProfileId)) {
    return { eligible: false, reason: "not_a_party" };
  }
  if (!isInteractionCompleted(interaction, nowIso)) {
    return { eligible: false, reason: "interaction_not_completed" };
  }
  const duplicate = existingRecords.some(
    (r) =>
      r.authorProfileId === authorProfileId &&
      r.subjectProfileId === subjectProfileId &&
      r.interactionKind === interaction.kind &&
      r.interactionId === interaction.interactionId,
  );
  if (duplicate) {
    return { eligible: false, reason: "duplicate_for_interaction" };
  }
  return {
    eligible: true,
    kind: interaction.kind,
    interactionId: interaction.interactionId,
  };
}

// ── Aggregation honesty ──────────────────────────────────────────────────────

/** The ONLY aggregate this contract permits: a transparent count of
 *  published records. No average, no score, no percentage — and below the
 *  minimum the count itself is withheld (absence, not zero-shaming). */
export const MIN_RECORDS_FOR_VISIBLE_COUNT = 1;

export function visibleRecordCount(publishedCount: number): number | null {
  if (!Number.isInteger(publishedCount) || publishedCount < MIN_RECORDS_FOR_VISIBLE_COUNT) {
    return null;
  }
  return publishedCount;
}
