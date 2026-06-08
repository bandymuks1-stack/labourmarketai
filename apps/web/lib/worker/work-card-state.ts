/**
 * "Mano darbo kortelė" state engine (slice work-card-state-aware-v1).
 *
 * Pure decision logic — NO IO, NO DB, NO fake data. Maps a worker's REAL saved
 * signals to the calm continuity model the product needs:
 *
 *   - new       → the card is unstarted; show the short guided path once.
 *   - returning → the card is started; show a summary (what is clear / what is
 *                 missing) + ONE best next action + why it helps. Never re-ask
 *                 a dimension that is already saved.
 *   - stale     → the time-sensitive dimensions were last confirmed long ago;
 *                 do NOT restart onboarding — just ask "Ar tai vis dar galioja?".
 *
 * The five dimensions are the human path:
 *   work        → ką galiu dirbti  (primary profession + at least one skill)
 *   availability→ kada galiu pradėti
 *   location    → kur galiu dirbti
 *   pay         → kiek tikiuosi
 *   evidence    → kuo galiu įrodyti (work-journal entries)
 *
 * "Ask only what the system does not know": a dimension that is `set` is never
 * the next action and never re-asked (unless the user edits, or the card goes
 * stale).
 */

export type WorkDim = "work" | "availability" | "location" | "pay" | "evidence";

export type WorkCardState = "new" | "returning" | "stale";

/** Real, already-saved signals. No score, no match, no fabricated value. */
export interface WorkCardSignals {
  /** ką galiu dirbti — a primary profession is set. */
  readonly hasProfession: boolean;
  /** ką moku — count of self-declared skills. */
  readonly skillsCount: number;
  /** kada galiu — availability_status and/or available_from saved. */
  readonly availabilitySet: boolean;
  /** kur galiu — current_location_country and/or preferred_countries saved. */
  readonly locationSet: boolean;
  /** kiek tikiuosi — salary_min_eur and/or salary_max_eur saved. */
  readonly paySet: boolean;
  /** kuo įrodau — number of work-journal entries. */
  readonly evidenceCount: number;
  /** work_card_confirmed_at as epoch ms, or null if never saved / not migrated. */
  readonly confirmedAtMs: number | null;
}

export interface WorkCardNext {
  readonly dim: WorkDim;
  /** A real route when the action lives on another page (work → profile,
   *  evidence/complete → journal); null when the action is an inline edit of a
   *  card field (availability / location / pay). */
  readonly href: string | null;
  /** i18n key for the one-sentence "why this helps". */
  readonly whyKey: string;
}

export interface WorkCardDerived {
  readonly state: WorkCardState;
  /** Dimensions already saved — shown as "kas jau aišku". */
  readonly clear: WorkDim[];
  /** Dimensions not yet saved — shown as "ko dar trūksta". */
  readonly missing: WorkDim[];
  /** The single best next action (never more than one). */
  readonly next: WorkCardNext;
  /** Time-sensitive dimensions to confirm when state === "stale". */
  readonly staleDims: WorkDim[];
}

/** How long a saved card stays "fresh" before we calmly ask if it still holds.
 *  90 days — availability / location / pay rarely change week to week, so a
 *  quarterly check is continuity, not nagging. */
export const STALE_AFTER_DAYS = 90;
const STALE_MS = STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

/** Dimensions that can become stale (a preference that ages). Profession and
 *  evidence do not "expire", so they never trigger the confirm prompt. */
const TIME_SENSITIVE: readonly WorkDim[] = ["availability", "location", "pay"];

/** All dimensions in human-path priority order. */
const ORDER: readonly WorkDim[] = [
  "work",
  "availability",
  "location",
  "pay",
  "evidence",
];

const WHY: Record<WorkDim, string> = {
  work: "why.work",
  availability: "why.availability",
  location: "why.location",
  pay: "why.pay",
  evidence: "why.evidence",
};

/** Route for dimensions whose editing lives on another page; null = inline. */
const HREF: Record<WorkDim, string | null> = {
  work: "/dashboard/profile",
  availability: null,
  location: null,
  pay: null,
  evidence: "/dashboard/journal",
};

function isSet(s: WorkCardSignals, dim: WorkDim): boolean {
  switch (dim) {
    case "work":
      return s.hasProfession && s.skillsCount > 0;
    case "availability":
      return s.availabilitySet;
    case "location":
      return s.locationSet;
    case "pay":
      return s.paySet;
    case "evidence":
      return s.evidenceCount > 0;
  }
}

export function deriveWorkCardState(
  s: WorkCardSignals,
  nowMs: number,
): WorkCardDerived {
  const clear = ORDER.filter((d) => isSet(s, d));
  const missing = ORDER.filter((d) => !isSet(s, d));

  // The single best next action: the first unmet dimension in human-path order.
  // When all five are set, the next move is to keep the record growing.
  const firstMissing = missing[0];
  const nextDim: WorkDim = firstMissing ?? "evidence";
  const next: WorkCardNext = firstMissing
    ? { dim: nextDim, href: HREF[nextDim], whyKey: WHY[nextDim] }
    : { dim: "evidence", href: "/dashboard/journal", whyKey: "why.complete" };

  // "new" = nothing meaningful saved yet → show the guided path once. After ANY
  // saved dimension we are in continuity (returning/stale), never re-running the
  // full questionnaire.
  const startedCount = (["work", "availability", "location", "pay"] as WorkDim[])
    .filter((d) => isSet(s, d)).length;
  const isNew = startedCount === 0;

  // "stale" = a time-sensitive dimension is set AND the card was confirmed long
  // ago. Never for a new card; never restarts onboarding.
  const staleDims = TIME_SENSITIVE.filter((d) => isSet(s, d));
  const isStale =
    !isNew &&
    staleDims.length > 0 &&
    s.confirmedAtMs !== null &&
    nowMs - s.confirmedAtMs > STALE_MS;

  const state: WorkCardState = isNew
    ? "new"
    : isStale
      ? "stale"
      : "returning";

  return { state, clear, missing, next, staleDims };
}
