import { addDays, effectiveEndDay, rangesOverlapInclusive } from "@/lib/planning/planning-model";
import type {
  HeldTime,
  ReservationVerdict,
  ReservationWindow,
} from "@/lib/workforce/commitment-reservation";

/**
 * FEASIBLE ALTERNATIVES — what a planner can do instead, once a clash is known.
 *
 * THE GAP THIS CLOSES (J-TIME-FREEDOM step 4, "Alternatives are shown"). The
 * reservation verdict (`commitment-reservation.ts`) says WHAT collides and on
 * which days, and then stops. The gap timeline can say WHEN capacity is short,
 * the matching engine can say WHO fits a need, and nothing composed any of it
 * into "try these dates, or this person instead". This module is that
 * composition, and nothing more: it proposes, it never decides, and it never
 * writes.
 *
 * ── SEP-2: A PROPOSAL IS AN OFFER, NOT A RULE ──────────────────────────────
 *
 * Every alternative here is something the planner MAY do. The clash they were
 * warned about remains theirs to accept (a half-day overlap, a handover, a
 * thing the database does not know), and accepting it is a first-class
 * outcome, not a failure to take the advice. Nothing in this file can express
 * "you must".
 *
 * ── SEP-7: AN ALTERNATIVE IS ONLY AS SURE AS THE READS BEHIND IT ───────────
 *
 * A date window is reported `clear` only when every commitment it was checked
 * against carried dates. If the person also holds an assignment to a project
 * nobody dated, the proposed window is `unconfirmed`: nothing proves the
 * undated work does not cover it. Likewise a crew candidate is offered only
 * when their OWN verdict is `clear`; a candidate whose reads did not answer is
 * listed as unconfirmed, never dressed up as free.
 *
 * ── SEP-1: NOTHING HERE IS A FACT ──────────────────────────────────────────
 *
 * The proposals are DERIVED on every call from the commitments as read and
 * are never stored. A proposed date that the planner adopts becomes a PLAN by
 * their act; until then it is a suggestion that will change when the
 * commitments change.
 *
 * PURE. No IO, no clock — the caller passes `notBefore` (usually today) so a
 * proposal never points into the past, and the same inputs always produce the
 * same proposals in the same order.
 */

/** How far the date search looks in either direction. Beyond this a
 *  planner is not looking for a shift — they are planning a different job. */
export const DATE_SEARCH_HORIZON_DAYS = 365;

/** At most this many crew alternatives are proposed. A longer list is a
 *  roster, not a proposal. */
export const MAX_CREW_ALTERNATIVES = 8;

export type AlternativeConfidence = "clear" | "unconfirmed";

/** The same person, a different window of the same length. */
export interface DateAlternative {
  readonly startDate: string;
  readonly endDate: string;
  /** Calendar days from the proposed start; negative = earlier. */
  readonly shiftDays: number;
  readonly direction: "earlier" | "later";
  /**
   * `clear` when every commitment checked carried dates. `unconfirmed` when
   * the person also holds an undated commitment — the window overlaps no
   * DATED commitment, and nothing proves it is free.
   */
  readonly confidence: AlternativeConfidence;
}

/** Someone the caller already manages, checked for the SAME window. */
export interface CrewCandidate {
  readonly workerId: string;
  readonly profileId: string;
  readonly name: string;
  readonly verdict: ReservationVerdict;
}

export interface CrewAlternative {
  readonly workerId: string;
  readonly profileId: string;
  readonly name: string;
  readonly confidence: AlternativeConfidence;
}

export interface AlternativesProposal {
  /**
   * `proposed`       — at least one alternative exists;
   * `none`           — the search ran fully and found nothing to offer;
   * `not_applicable` — there was no clash, or the verdict was `unknown`, so
   *                    proposing around it would be proposing around a guess.
   */
  readonly status: "proposed" | "none" | "not_applicable";
  readonly dates: readonly DateAlternative[];
  readonly crew: readonly CrewAlternative[];
  /** Inclusive days of the proposed window; the length every date
   *  alternative preserves. */
  readonly windowDays: number | null;
  /** How many roster candidates were examined for the crew list — so "no
   *  crew alternative" can be read against the size of the search. */
  readonly crewExamined: number;
}

/** Inclusive calendar days between two ISO days. */
function inclusiveDays(startDate: string, endDate: string): number {
  const a = Date.UTC(
    Number(startDate.slice(0, 4)),
    Number(startDate.slice(5, 7)) - 1,
    Number(startDate.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(endDate.slice(0, 4)),
    Number(endDate.slice(5, 7)) - 1,
    Number(endDate.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000) + 1;
}

interface DatedHold {
  readonly startDate: string;
  readonly endDate: string;
}

function datedHolds(held: readonly HeldTime[], exclude: ReadonlySet<string>): {
  dated: DatedHold[];
  undated: number;
} {
  const dated: DatedHold[] = [];
  let undated = 0;
  for (const h of held) {
    if (exclude.has(h.sourceId)) continue;
    const end = effectiveEndDay(h);
    if (!h.startDate || !end) {
      undated += 1;
      continue;
    }
    dated.push({ startDate: h.startDate, endDate: end });
  }
  return { dated, undated };
}

function windowIsFree(start: string, end: string, dated: readonly DatedHold[]): boolean {
  return dated.every((d) => !rangesOverlapInclusive(start, end, d.startDate, d.endDate));
}

/**
 * The nearest free windows of the SAME LENGTH, one in each direction.
 *
 * Later: the first start on or after the proposed start whose window
 * overlaps no dated commitment. Earlier: the last such start before it, never
 * before `notBefore`. The proposed window itself is skipped in both
 * directions — it is the one that collides. The search is bounded by
 * `DATE_SEARCH_HORIZON_DAYS`; day-by-day is fine at that bound (365 checks
 * against a handful of commitments) and keeps the rule readable: a window is
 * free when nothing dated overlaps it.
 */
export function proposeDateAlternatives(input: {
  readonly window: ReservationWindow;
  readonly held: readonly HeldTime[];
  readonly exclude?: readonly string[];
  /** ISO day. No proposal starts before it. */
  readonly notBefore: string;
}): readonly DateAlternative[] {
  const start = input.window.startDate;
  const end = effectiveEndDay(input.window);
  if (!start || !end) return [];
  const length = inclusiveDays(start, end);
  const { dated, undated } = datedHolds(input.held, new Set(input.exclude ?? []));
  const confidence: AlternativeConfidence = undated > 0 ? "unconfirmed" : "clear";
  const out: DateAlternative[] = [];

  for (let shift = 1; shift <= DATE_SEARCH_HORIZON_DAYS; shift += 1) {
    const s = addDays(start, shift);
    const e = addDays(s, length - 1);
    if (windowIsFree(s, e, dated)) {
      out.push({ startDate: s, endDate: e, shiftDays: shift, direction: "later", confidence });
      break;
    }
  }

  for (let shift = 1; shift <= DATE_SEARCH_HORIZON_DAYS; shift += 1) {
    const s = addDays(start, -shift);
    if (s < input.notBefore) break;
    const e = addDays(s, length - 1);
    if (windowIsFree(s, e, dated)) {
      out.push({ startDate: s, endDate: e, shiftDays: -shift, direction: "earlier", confidence });
      break;
    }
  }

  // Earlier first when both exist — the smaller change to the plan's place
  // in time is the one a planner usually wants to see first, and a stable
  // order means the same facts render the same way twice.
  return out.sort((a, b) => Math.abs(a.shiftDays) - Math.abs(b.shiftDays) || a.shiftDays - b.shiftDays);
}

/**
 * Who else could take the window. Only a candidate whose OWN verdict is
 * `clear` is offered as clear; `unknown` is offered as unconfirmed and says
 * so; `collides` is not an alternative at all. The person who collided is
 * never proposed as their own replacement.
 */
export function proposeCrewAlternatives(input: {
  readonly collidingWorkerId: string;
  readonly candidates: readonly CrewCandidate[];
}): readonly CrewAlternative[] {
  const out: CrewAlternative[] = [];
  for (const c of input.candidates) {
    if (c.workerId === input.collidingWorkerId) continue;
    if (c.verdict.state === "collides") continue;
    out.push({
      workerId: c.workerId,
      profileId: c.profileId,
      name: c.name,
      confidence: c.verdict.state === "clear" ? "clear" : "unconfirmed",
    });
  }
  // Clear before unconfirmed, then by name — deterministic.
  return out
    .sort((a, b) =>
      a.confidence === b.confidence
        ? a.name.localeCompare(b.name)
        : a.confidence === "clear"
          ? -1
          : 1,
    )
    .slice(0, MAX_CREW_ALTERNATIVES);
}

/** The one composition. */
export function proposeAlternatives(input: {
  readonly verdict: ReservationVerdict;
  readonly window: ReservationWindow;
  readonly collidingWorkerId: string;
  readonly held: readonly HeldTime[];
  readonly exclude?: readonly string[];
  readonly candidates: readonly CrewCandidate[];
  readonly notBefore: string;
}): AlternativesProposal {
  const start = input.window.startDate;
  const end = effectiveEndDay(input.window);
  const windowDays = start && end ? inclusiveDays(start, end) : null;
  const crewExamined = input.candidates.filter((c) => c.workerId !== input.collidingWorkerId).length;

  if (input.verdict.state !== "collides") {
    // No clash: nothing to route around. Unknown: proposing dates around
    // commitments that could not be read would be a confident answer built
    // on an unread source — the exact defect the verdict refuses to commit.
    return { status: "not_applicable", dates: [], crew: [], windowDays, crewExamined };
  }

  const dates = proposeDateAlternatives({
    window: input.window,
    held: input.held,
    exclude: input.exclude,
    notBefore: input.notBefore,
  });
  const crew = proposeCrewAlternatives({
    collidingWorkerId: input.collidingWorkerId,
    candidates: input.candidates,
  });
  return {
    status: dates.length > 0 || crew.length > 0 ? "proposed" : "none",
    dates,
    crew,
    windowDays,
    crewExamined,
  };
}
