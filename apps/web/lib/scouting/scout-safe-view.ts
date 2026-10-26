/**
 * Company-facing scouting — SAFE VIEW MAPPER (Step 3B).
 *
 * The single transform that turns an employer-discoverable worker (supply
 * subject) + its deterministic match result into the ONLY shape the company UI
 * may render. It routes every worker field through the Step 3A visibility
 * policy (`toShortlistSafePreview`), so the company surface receives an
 * anonymized, profile-safe preview — never a name, contact, bio, or private
 * field. `assertContactSafe` is the runtime net at this boundary.
 *
 * Pure (no IO, no "server-only"): unit-tested directly. The server scouting
 * layer calls this; the page renders only its output.
 */
import {
  toShortlistSafePreview,
  canStartCommunicationOrBooking,
  assertContactSafe,
  type WorkerShortlistSafePreview,
} from "@/lib/visibility/worker-profile-visibility";
import type { MatchResultV1, MatchSubject } from "@/lib/market/match-v1";
import {
  companyCandidateReadiness,
  type CompanyCandidateReadiness,
} from "@/lib/scouting/candidate-readiness";
import { attachReadiness } from "@/lib/readiness/with-readiness";
import { deriveReadiness } from "@/lib/readiness/readiness-model";
import { requirementsForContext } from "@/lib/readiness/context-requirements";
import type { LastActiveBucket } from "@/lib/scouting/profile-freshness";
import {
  mayOfferEmployerActions,
  type CandidateActionabilityV1,
} from "@/lib/scouting/candidate-actionability";

export type ShortlistStatus = "saved" | "interested" | "not_fit" | "reviewed";

export interface ScoutSafeCandidate {
  readonly workerId: string;
  /** Public-safe profession category slug (localized at the UI). */
  readonly professionSlug: string | null;
  /** The ONLY worker data the company UI may show. Anonymized, contact-free. */
  readonly preview: WorkerShortlistSafePreview;
  /** Owner rule 6 — may communication/booking start (free schedule OR date). */
  readonly canContact: boolean;
  /** Deterministic, need-context match (status/why/gaps/skill-fit). No PII. */
  readonly match: MatchResultV1;
  /** Safe readiness signal (country/availability fit; docs stay consent-gated). */
  readonly readiness: CompanyCandidateReadiness;
  readonly shortlistStatus: ShortlistStatus | null;
  /** The company's OWN internal shortlist note (extension B — the
   *  demand_shortlist.note column, owner-scoped by RLS; a worker can never
   *  read it). Company-authored text about its own decision, not worker
   *  data — null until the company writes one. */
  readonly shortlistNote: string | null;
  /** Honest profile freshness (Wagon 1) — from the worker row's real
   *  updated_at/created_at, never fabricated. Non-PII. */
  readonly lastActiveBucket: LastActiveBucket;
  /**
   * CURRENT actionability for THIS need (owner ruling 2026-09-22), decided
   * once by `lib/scouting/candidate-actionability.ts`. A candidate that
   * reached this view is actionable now or actionable LATER — the surface
   * must read this before implying "available now", and must not offer an
   * action the verdict does not allow.
   */
  readonly actionability: CandidateActionabilityV1;
}

/**
 * A person who RAISED A HAND on a need that names no trade (owner decision
 * 2026-10-22): "When a worker expresses interest in an open need without a
 * specified trade, show that interest to the employer immediately, subject to
 * existing worker privacy and consent rules. Clearly label trade matching as
 * not assessed. Do not invent or imply verified qualifications."
 *
 * The SAME safe view as a scouted candidate — the same Step 3A preview, the
 * same `assertContactSafe` net, the same two contact gates and the same
 * actionability verdict — MINUS everything a match would have said. There is
 * no `match`, no `readiness` (its country fit is a fit signal too), no score,
 * no band, no rank: the need gave the engine nothing to compare against, so
 * nothing was compared. `matchAssessed: false` is a literal on purpose — a
 * surface cannot render this shape without deciding what to say about it.
 */
export interface UnassessedHandRaiser
  extends Omit<ScoutSafeCandidate, "match" | "readiness"> {
  readonly matchAssessed: false;
  /** The worker's own interest state on THIS need (`demand_interest_signals`).
   *  Never `withdrawn`: a withdrawn hand is not a live proposal and never
   *  reaches this shape. */
  readonly interestStatus: string;
}

/** Real evidence (beyond self-declared) count for the worker's skills. */
export function countWorkerEvidence(subject: MatchSubject): number {
  return subject.skills.filter(
    (s) => s.evidence === "manager_confirmed" || s.evidence === "work_journal",
  ).length;
}

/**
 * Map one supply candidate to the safe company-facing view. Throws (via
 * assertContactSafe) if the visibility policy ever lets a contact/private key
 * through — fail loud rather than leak.
 */
export function toScoutSafeCandidate(input: {
  readonly workerId: string;
  readonly professionSlug: string | null;
  readonly subject: MatchSubject;
  readonly match: MatchResultV1;
  /** The need's country (for the country-fit signal). Optional. */
  readonly needCountry?: string | null;
  readonly shortlistStatus: ShortlistStatus | null;
  /** The company's own stored note for this pair (optional; default null). */
  readonly shortlistNote?: string | null;
  readonly lastActiveBucket: LastActiveBucket;
  /** The canonical verdict for this candidate on this need. Required: a
   *  caller that had to decide it anyway must hand it over, so no surface
   *  can assemble a candidate without one. */
  readonly actionability: CandidateActionabilityV1;
  /** A start date is set although the plan may withhold the date itself (identity split /
   *  plan limit). Optional: absent = read the subject's own date. */
  readonly startDateSet?: boolean;
  /** Clock for expiry arithmetic (defaults to now). */
  readonly now?: Date;
}): ScoutSafeCandidate {
  const { preview, canContact } = safePreviewAndContact(input);
  const readiness = companyCandidateReadiness(input.needCountry, preview);

  return {
    workerId: input.workerId,
    professionSlug: input.professionSlug,
    preview,
    canContact,
    // FIT is input.match untouched; READINESS (decision 0021) rides beside it
    // as requirement-only: a company cannot read a worker's records, so
    // nothing is "missing" here - outstanding pre-contract checks are
    // `required`, and an unknowable requirement set is `unknown`. It never
    // changes the match status, the ranking, or who is shown.
    match: attachReadiness(
      input.match,
      deriveReadiness({
        requirements: requirementsForContext({
          workCountry: input.needCountry,
          personCountry: input.subject.country,
        }),
        records: [],
        recordsReadable: false,
        now: input.now ?? new Date(),
      }),
    ),
    readiness,
    shortlistStatus: input.shortlistStatus,
    shortlistNote: input.shortlistNote ?? null,
    lastActiveBucket: input.lastActiveBucket,
    actionability: input.actionability,
  };
}

/**
 * Map one hand-raiser on a need with NO derivable trade to the safe
 * company-facing view. Same preview, same contact gates, same actionability
 * as `toScoutSafeCandidate` — and no match of any kind (see
 * `UnassessedHandRaiser`).
 */
export function toUnassessedHandRaiser(input: {
  readonly workerId: string;
  readonly professionSlug: string | null;
  readonly subject: MatchSubject;
  readonly interestStatus: string;
  readonly shortlistStatus: ShortlistStatus | null;
  readonly shortlistNote?: string | null;
  readonly lastActiveBucket: LastActiveBucket;
  readonly actionability: CandidateActionabilityV1;
  readonly startDateSet?: boolean;
}): UnassessedHandRaiser {
  const { preview, canContact } = safePreviewAndContact(input);
  return {
    matchAssessed: false,
    workerId: input.workerId,
    professionSlug: input.professionSlug,
    preview,
    canContact,
    interestStatus: input.interestStatus,
    shortlistStatus: input.shortlistStatus,
    shortlistNote: input.shortlistNote ?? null,
    lastActiveBucket: input.lastActiveBucket,
    actionability: input.actionability,
  };
}

/** The part both views share: the Step 3A preview behind the runtime net,
 *  and the two contact gates. ONE definition, so a hand-raiser can never be
 *  shown more of a person — or offered contact more easily — than a scouted
 *  candidate. */
function safePreviewAndContact(input: {
  readonly workerId: string;
  readonly subject: MatchSubject;
  readonly actionability: CandidateActionabilityV1;
  readonly startDateSet?: boolean;
}): { preview: WorkerShortlistSafePreview; canContact: boolean } {
  const preview = toShortlistSafePreview({
    id: input.workerId,
    // skills/headline/displayName are intentionally NOT passed — the skill
    // story is told by the need-context match (skill-fit + evidence), and the
    // worker stays anonymized. location/availability/rate/evidence are the
    // owner-approved profile-safe fields.
    locationCountry: input.subject.country ?? null,
    preferredCountries: input.subject.preferredCountries ?? [],
    availabilityStatus: input.subject.availabilityStatus ?? null,
    availableFrom: input.subject.availableFrom ?? null,
    rateMinEur: input.subject.salaryMinEur ?? null,
    evidenceCount: countWorkerEvidence(input.subject),
    // The worker's own stated years - an already owner-approved preview
    // field. Passed through only when the source holds a real value; a missing
    // value stays null (rendered as nothing, never as 0).
    experienceYears: input.subject.experienceYears ?? null,
  });

  // Runtime safety net at the company-facing boundary.
  assertContactSafe(preview as unknown as Record<string, unknown>);

  // TWO GATES, AND BOTH MUST PASS. The schedule gate asks "is there a date
  // to talk about"; the actionability verdict asks "is this still a live
  // proposal". A withdrawn worker with a perfectly good calendar passes the
  // first and must still fail the second.
  const canContact =
    mayOfferEmployerActions(input.actionability) &&
    canStartCommunicationOrBooking({
      availabilityStatus: input.subject.availabilityStatus ?? null,
      availableFrom:
        input.subject.availableFrom ?? (input.startDateSet === true ? "set" : null),
    });

  return { preview, canContact };
}

/** Strip the deterministic "Candidate " prefix → the anonymized token only. */
export function anonymizedToken(anonymizedLabel: string): string {
  return anonymizedLabel.replace(/^Candidate\s*/i, "").trim() || anonymizedLabel;
}
