/**
 * CANDIDATE ACTIONABILITY — the ONE place that answers "may this person be
 * presented to this employer as a live proposal for THIS need, right now?"
 * (owner ruling 2026-09-22, correcting the earlier "availability=false →
 * remove" instruction.)
 *
 * WHY THIS MODULE EXISTS. Every rule below already existed somewhere: the
 * worker pool drops deleted rows, RLS drops workers who withdrew
 * discoverability consent, `scouting.ts` skipped withdrawn interest, #1836
 * gated a closed need's controls. Scattered, they are four different
 * answers to one question — so a NEW surface reading the same tables gets
 * none of them for free and quietly presents somebody who is not there. The
 * failure mode is not a wrong pixel: it is an employer acting on a person
 * who has withdrawn.
 *
 * WHAT THIS IS NOT:
 *
 *   NOT A SCORE. It returns a reason, never a number and never a ranking.
 *   "Do not turn availability into a subjective candidate score."
 *
 *   NOT A HIRING DECISION. It decides whether something is OFFERED for a
 *   human to act on, never whether a person is suitable. No branch reads
 *   skills, evidence or fit.
 *
 *   NOT A DELETION. History is a different concept from current
 *   actionability, and this module owns only the second. Nothing here
 *   removes a row; a decided candidate keeps their record and their
 *   provenance, and a surface may still render them as a recorded FACT.
 *
 * AVAILABILITY IS NOT A PROHIBITION (the owner's correction). A person who
 * says "available from 15 October" is not unavailable — they are available
 * later. For a need that starts after that date they stay fully actionable;
 * for a need that starts before it they are `actionable_later`, which a
 * surface must not present as "available now". That is a THIRD answer on
 * purpose: collapsing it into "not actionable" would delete real future
 * supply from the market, which is the workforce-planner reduction the
 * product must never become (COMMITMENT ≠ PROHIBITION, SEP-2).
 *
 * An OVERLAPPING COMMITMENT is deliberately absent from the
 * `not_actionable` set for the same reason. The booking layer already
 * treats a clash as a fact requiring explicit acknowledgement, not as a
 * ban; re-deciding it here would turn a commitment into a prohibition in a
 * second place, with no audit and no override.
 *
 * Pure: no IO, no env, no clock of its own (the caller passes `nowIso`, so
 * the same inputs always give the same answer and a test can sit on any
 * date). i18n CODES only — no sentence, no enum ever reaches a screen.
 */

/** Why a person is not a live proposal for this need right now. */
export type NotActionableReason =
  /** The worker record is gone or no longer readable — deleted account, or
   *  a row RLS will not return. There is nobody to propose. */
  | "worker_record_absent"
  /** The worker withdrew from THIS opportunity. Scoped to the opportunity:
   *  they remain fully actionable for every other need. */
  | "worker_withdrew_interest"
  /** The worker withdrew permission to be discovered / receive proposals.
   *  Enforced in the database by `worker_profile_discoverable`; repeated
   *  here so a surface that somehow holds a stale row still refuses. */
  | "worker_not_discoverable"
  /** The need is closed or expired: there are no live proposals on it at
   *  all, whoever the person is. */
  | "need_closed"
  /** The employer has recorded a final decision on this candidate for this
   *  need. Their own record — kept, shown as a decision, not re-offered. */
  | "employer_decided";

export type CandidateActionabilityV1 =
  /** A live proposal: may carry contact / shortlist / booking controls. */
  | { readonly kind: "actionable" }
  /**
   * Real future supply. The person can satisfy the need, but not from the
   * date the need starts — so they stay discoverable and must NOT be
   * presented as available now.
   */
  | {
      readonly kind: "actionable_later";
      readonly reason: "available_from_after_need_start";
      /** The worker's own stated date — their fact, never inferred. */
      readonly availableFrom: string;
    }
  | { readonly kind: "not_actionable"; readonly reason: NotActionableReason };

/** Interest states that mean the worker stepped back from this opportunity. */
const WITHDRAWN_INTEREST = new Set(["withdrawn"]);

/**
 * Employer-side shortlist states that are a FINAL decision on this
 * candidate for this need. `saved` / `interested` / `reviewed` are all
 * mid-flight and stay actionable — only an explicit "not a fit" closes it.
 */
const FINAL_EMPLOYER_DECISION = new Set(["not_fit"]);

/** Need statuses on which no proposal is live. Mirrors the closed/expired
 *  half of the demand lifecycle; everything else is an open need. */
const CLOSED_NEED_STATUSES = new Set(["closed", "expired", "cancelled", "fulfilled"]);

export interface CandidateActionabilityInput {
  /** The need's canonical status (`customer_requests.status`). */
  readonly needStatus: string | null;
  /** The need's start, when stated. Absent → no date to be late for. */
  readonly needStartsOn?: string | null;
  /** False when the worker row could not be read / no longer exists. */
  readonly workerRecordPresent: boolean;
  /** The DB's own consent answer, when the caller has it. Undefined means
   *  "not separately checked" — RLS already filtered the read, so this is
   *  not treated as a refusal (SEP-7: UNKNOWN is not FALSE). */
  readonly discoverable?: boolean;
  /** This worker's interest state ON THIS NEED, or null when they never
   *  expressed one. `withdrawn` must reach here — a caller that filters it
   *  out first turns "they withdrew" into "they never answered". */
  readonly interestStatus: string | null;
  /** The employer's own shortlist state for this worker on this need. */
  readonly shortlistStatus: string | null;
  /** The worker's stated availability (`workers.availability_status`). */
  readonly availabilityStatus?: string | null;
  /** The worker's stated "available from" date. */
  readonly availableFrom?: string | null;
}

/**
 * The canonical answer. Order is the contract:
 *
 *   1. the NEED — a closed need has no live proposals at all, so nothing
 *      about the person can make one;
 *   2. the PERSON'S EXISTENCE and CONSENT — no record, or consent withdrawn,
 *      and there is nobody to propose;
 *   3. the PERSON'S OWN WITHDRAWAL from this opportunity — their decision
 *      outranks the employer's, and is scoped to this need;
 *   4. the EMPLOYER'S OWN final decision — kept as their record;
 *   5. TIME — and only ever as `actionable_later`, never as a refusal.
 */
export function candidateActionability(
  input: CandidateActionabilityInput,
  nowIso: string,
): CandidateActionabilityV1 {
  const status = (input.needStatus ?? "").trim().toLowerCase();
  if (CLOSED_NEED_STATUSES.has(status)) {
    return { kind: "not_actionable", reason: "need_closed" };
  }

  if (!input.workerRecordPresent) {
    return { kind: "not_actionable", reason: "worker_record_absent" };
  }
  if (input.discoverable === false) {
    return { kind: "not_actionable", reason: "worker_not_discoverable" };
  }

  const interest = (input.interestStatus ?? "").trim().toLowerCase();
  if (WITHDRAWN_INTEREST.has(interest)) {
    return { kind: "not_actionable", reason: "worker_withdrew_interest" };
  }

  const shortlist = (input.shortlistStatus ?? "").trim().toLowerCase();
  if (FINAL_EMPLOYER_DECISION.has(shortlist)) {
    return { kind: "not_actionable", reason: "employer_decided" };
  }

  // TIME, last and gently. "available" outranks a stale date: a person who
  // says they are available now is available now, whatever an older
  // `available_from` says.
  const availability = (input.availabilityStatus ?? "").trim().toLowerCase();
  const from = (input.availableFrom ?? "").slice(0, 10);
  if (availability !== "available" && from.length === 10) {
    // The date the person must be ready for: the need's stated start, or
    // today when the need states none (an employer with no stated start is
    // asking about now).
    const needsBy = (input.needStartsOn ?? nowIso).slice(0, 10);
    // ISO yyyy-mm-dd compares lexicographically.
    if (from > needsBy) {
      return {
        kind: "actionable_later",
        reason: "available_from_after_need_start",
        availableFrom: from,
      };
    }
  }

  return { kind: "actionable" };
}

/** i18n codes for the reasons. Codes, never sentences — the surface owns
 *  the words, and a technical enum must never reach a screen. */
export const ACTIONABILITY_REASON_CODE: Readonly<Record<NotActionableReason, string>> = {
  worker_record_absent: "scouting.actionability.workerRecordAbsent",
  worker_withdrew_interest: "scouting.actionability.workerWithdrew",
  worker_not_discoverable: "scouting.actionability.workerNotDiscoverable",
  need_closed: "scouting.actionability.needClosed",
  employer_decided: "scouting.actionability.employerDecided",
};

export const ACTIONABLE_LATER_CODE = "scouting.actionability.availableFrom";

/** Whether a surface may offer employer-side ACTIONS (contact, booking,
 *  shortlist writes) on this candidate. `actionable_later` may be contacted
 *  — a conversation about a future start is exactly the point — but the
 *  surface must say WHEN they are free rather than implying "now". */
export function mayOfferEmployerActions(a: CandidateActionabilityV1): boolean {
  return a.kind === "actionable" || a.kind === "actionable_later";
}
