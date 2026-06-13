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
  readonly shortlistStatus: ShortlistStatus | null;
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
  readonly shortlistStatus: ShortlistStatus | null;
}): ScoutSafeCandidate {
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
  });

  // Runtime safety net at the company-facing boundary.
  assertContactSafe(preview as unknown as Record<string, unknown>);

  const canContact = canStartCommunicationOrBooking({
    availabilityStatus: input.subject.availabilityStatus ?? null,
    availableFrom: input.subject.availableFrom ?? null,
  });

  return {
    workerId: input.workerId,
    professionSlug: input.professionSlug,
    preview,
    canContact,
    match: input.match,
    shortlistStatus: input.shortlistStatus,
  };
}

/** Strip the deterministic "Candidate " prefix → the anonymized token only. */
export function anonymizedToken(anonymizedLabel: string): string {
  return anonymizedLabel.replace(/^Candidate\s*/i, "").trim() || anonymizedLabel;
}
