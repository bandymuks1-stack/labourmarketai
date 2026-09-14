import { effectiveEndDay, rangesOverlapInclusive } from "@/lib/planning/planning-model";

/**
 * CAPACITY RESERVATION — can this person really be in two places at once?
 *
 * THE GAP THIS CLOSES (CAL-7). The product could already answer "who is free
 * this week?" — `lib/conversation/capacity-core.ts` composes approved absences
 * and committed work into that answer, and the worker's own calendar flags
 * their overlapping commitments. What nothing did was ask the question AT THE
 * MOMENT OF COMMITMENT. A manager assigning someone to a project was told
 * nothing about the accepted booking or the approved leave already covering
 * those dates; the collision only became visible later, on a screen they were
 * not looking at, to a person who could not fix it.
 *
 * ── SEP-2: A RESERVATION WARNS, IT NEVER PROHIBITS ─────────────────────────
 *
 * This module returns a VERDICT. It has no authority to refuse anything and
 * deliberately no way to express refusal. Real work is full of commitments
 * that overlap on paper and are fine in life — a half-day here, a handover
 * there, a manager who knows something the database does not. A planner that
 * blocks turns a warning into an obstacle to route around, and the routing
 * around is how the data stops being true. So: say what collides, say it
 * where the decision is made, and let the person decide.
 *
 * ── SEP-7: "NOTHING FOUND" IS NOT "NOTHING THERE" ──────────────────────────
 *
 * `clear` is the strongest thing this file can say and it is issued ONLY when
 * every source answered. If a read failed, if a store is not provisioned, if
 * the window has no start date, or if the person holds an assignment to a
 * project nobody dated — the verdict is `unknown`, and it names why. An
 * unread source dressed as an empty schedule is exactly how the capacity
 * answer told an employer that a booked worker was free.
 *
 * PURE. No IO, no dates library, no clock. The overlap rule is IMPORTED from
 * `planning-model` rather than restated: inclusive calendar-day ranges where
 * touching edges count, the same semantics as the booking accept guard, so
 * the reservation view and the calendar can never disagree about what an
 * overlap is.
 */

/** What can hold a person's time. Four sources, four different meanings —
 *  `trip` joined on 2026-09-14: an approved business trip is a person working
 *  somewhere else, which is a commitment, and it was the one dated commitment
 *  the employer side did not count. */
export const RESERVATION_SOURCES = ["project", "booking", "trip", "absence"] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

/** A commitment that already holds part of this person's calendar. */
export interface HeldTime {
  readonly source: ReservationSource;
  /** The real row, so a caller can link to it. */
  readonly sourceId: string;
  /**
   * Real title, or null. Absence is ALWAYS null and must stay null: an
   * employer may learn that someone is unavailable, never why
   * (`lib/planning/employer-availability.ts` never even reads the reason).
   * A trip carries its DESTINATION and never its purpose, for the same
   * reason and by the same means — the purpose column is not read at all.
   */
  readonly label: string | null;
  readonly startDate: string | null;
  /** Null = open-ended; `effectiveEndDay` resolves it to the start day. */
  readonly endDate: string | null;
}

/** The dates the caller is about to commit the person to. */
export interface ReservationWindow {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export interface ReservationCollision extends HeldTime {
  /** First shared day. */
  readonly overlapStart: string;
  /** Last shared day. */
  readonly overlapEnd: string;
}

/** Why an answer is incomplete. Every case is named; none is silent. */
export type ReservationGap =
  /** A source could not be read, or its store is not provisioned. */
  | { readonly reason: "source_unreadable"; readonly source: ReservationSource }
  /** The proposed window has no start date — there is nothing to compare. */
  | { readonly reason: "undated_window" }
  /** A real commitment whose own dates are missing. */
  | {
      readonly reason: "undated_commitment";
      readonly source: ReservationSource;
      readonly sourceId: string;
      readonly label: string | null;
    };

export type ReservationState = "clear" | "collides" | "unknown";

export interface ReservationVerdict {
  readonly state: ReservationState;
  readonly collisions: readonly ReservationCollision[];
  readonly gaps: readonly ReservationGap[];
}

function laterOf(a: string, b: string): string {
  return a >= b ? a : b;
}
function earlierOf(a: string, b: string): string {
  return a <= b ? a : b;
}

/**
 * The one reservation rule.
 *
 * `exclude` drops commitments by source id — the caller re-checking a
 * commitment it has just made must not be shown its own new row as a
 * collision with itself.
 *
 * `unreadableSources` is the caller's honest report of which reads did not
 * answer. Passing an empty list when a read failed is the one way to make
 * this function lie, which is why the server composition
 * (`lib/planning/worker-reservation.ts`) derives it from the read results
 * rather than from a flag anyone can forget.
 */
export function reserveCapacity(input: {
  readonly window: ReservationWindow;
  readonly held: readonly HeldTime[];
  readonly unreadableSources?: readonly ReservationSource[];
  readonly exclude?: readonly string[];
}): ReservationVerdict {
  const gaps: ReservationGap[] = [];
  for (const source of input.unreadableSources ?? []) {
    gaps.push({ reason: "source_unreadable", source });
  }

  const windowEnd = effectiveEndDay(input.window);
  if (!input.window.startDate || !windowEnd) {
    // Nothing to compare against. Reporting `clear` here would be the purest
    // form of the defect: a confident answer derived from no question.
    return { state: "unknown", collisions: [], gaps: [...gaps, { reason: "undated_window" }] };
  }

  const excluded = new Set(input.exclude ?? []);
  const collisions: ReservationCollision[] = [];
  for (const held of input.held) {
    if (excluded.has(held.sourceId)) continue;
    const heldEnd = effectiveEndDay(held);
    if (!held.startDate || !heldEnd) {
      gaps.push({
        reason: "undated_commitment",
        source: held.source,
        sourceId: held.sourceId,
        label: held.label,
      });
      continue;
    }
    if (!rangesOverlapInclusive(input.window.startDate, windowEnd, held.startDate, heldEnd)) {
      continue;
    }
    collisions.push({
      ...held,
      overlapStart: laterOf(input.window.startDate, held.startDate),
      overlapEnd: earlierOf(windowEnd, heldEnd),
    });
  }

  // Order: earliest overlap first, then by source id — deterministic, so the
  // same facts render the same way twice.
  const ordered = [...collisions].sort((a, b) =>
    a.overlapStart === b.overlapStart
      ? a.sourceId.localeCompare(b.sourceId)
      : a.overlapStart.localeCompare(b.overlapStart),
  );

  if (ordered.length > 0) return { state: "collides", collisions: ordered, gaps };
  // A clean answer requires a COMPLETE one. This is the whole of SEP-7 in
  // this file: no gaps, or no `clear`.
  return gaps.length > 0
    ? { state: "unknown", collisions: [], gaps }
    : { state: "clear", collisions: [], gaps: [] };
}
