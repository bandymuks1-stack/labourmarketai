import { describe, expect, it } from "vitest";

import {
  DATE_SEARCH_HORIZON_DAYS,
  MAX_CREW_ALTERNATIVES,
  proposeAlternatives,
  proposeCrewAlternatives,
  proposeDateAlternatives,
  type CrewCandidate,
} from "./commitment-alternatives";
import { reserveCapacity, type HeldTime, type ReservationVerdict } from "./commitment-reservation";

/**
 * J-TIME-FREEDOM step 4 — "Alternatives are shown".
 *
 * The rule under test: once a clash is KNOWN, propose the nearest free window
 * of the same length for the same person, and anyone on the roster who is
 * clear for the same window. Propose, never impose; derive, never store; and
 * never call a window or a person free on the strength of a read that did
 * not answer.
 */

const window = { startDate: "2026-10-05", endDate: "2026-10-09" }; // 5 days

const project = (id: string, start: string, end: string): HeldTime => ({
  source: "project",
  sourceId: id,
  label: `Project ${id}`,
  startDate: start,
  endDate: end,
});

const clear: ReservationVerdict = { state: "clear", collisions: [], gaps: [] };
const unknown: ReservationVerdict = {
  state: "unknown",
  collisions: [],
  gaps: [{ reason: "source_unreadable", source: "absence" }],
};

function collidingVerdict(held: readonly HeldTime[]): ReservationVerdict {
  return reserveCapacity({ window, held });
}

describe("date alternatives — same person, same length, nearest free window", () => {
  it("proposes the first free window after the clash and the last one before it", () => {
    const held = [project("p1", "2026-10-07", "2026-10-12")];
    const out = proposeDateAlternatives({ window, held, notBefore: "2026-09-01" });
    // Earlier: shift by one day still touches 2026-10-07? Window 10-04..10-08
    // overlaps p1 (10-07). Shift -3: 10-02..10-06 — free. Later: 10-13..10-17.
    expect(out.map((d) => [d.direction, d.startDate, d.endDate, d.shiftDays])).toEqual([
      ["earlier", "2026-10-02", "2026-10-06", -3],
      ["later", "2026-10-13", "2026-10-17", 8],
    ]);
    for (const d of out) expect(d.confidence).toBe("clear");
  });

  it("keeps the window length: a five-day plan is never shortened to fit", () => {
    const held = [project("p1", "2026-10-07", "2026-10-12"), project("p2", "2026-10-14", "2026-10-14")];
    const later = proposeDateAlternatives({ window, held, notBefore: "2026-09-01" }).find(
      (d) => d.direction === "later",
    );
    // 10-13..10-17 would include 10-14 (p2). Next free five-day window: 10-15..10-19.
    expect(later).toMatchObject({ startDate: "2026-10-15", endDate: "2026-10-19", shiftDays: 10 });
  });

  it("never proposes a window that starts before notBefore", () => {
    const held = [project("p1", "2026-10-07", "2026-10-12")];
    const out = proposeDateAlternatives({ window, held, notBefore: "2026-10-05" });
    expect(out.map((d) => d.direction)).toEqual(["later"]);
  });

  it("an undated commitment makes every date proposal unconfirmed — offered, not promised", () => {
    const held = [
      project("p1", "2026-10-07", "2026-10-12"),
      { source: "project", sourceId: "undated", label: null, startDate: null, endDate: null } as HeldTime,
    ];
    const out = proposeDateAlternatives({ window, held, notBefore: "2026-09-01" });
    expect(out.length).toBeGreaterThan(0);
    for (const d of out) expect(d.confidence).toBe("unconfirmed");
  });

  it("ignores the excluded source — the assignment just written is not routed around", () => {
    const held = [project("this-project", "2026-10-05", "2026-10-09"), project("p1", "2026-10-07", "2026-10-12")];
    const withExclude = proposeDateAlternatives({ window, held, exclude: ["this-project"], notBefore: "2026-09-01" });
    const asIfAbsent = proposeDateAlternatives({ window, held: held.slice(1), notBefore: "2026-09-01" });
    expect(withExclude).toEqual(asIfAbsent);
    // And without the exclusion the self-row would have pushed the earlier
    // window further back — proof the exclusion changes something.
    const without = proposeDateAlternatives({ window, held, notBefore: "2026-09-01" });
    expect(without.find((d) => d.direction === "earlier")?.startDate).toBe("2026-09-30");
  });

  it("proposes nothing for an undated window — there is no length to preserve", () => {
    expect(
      proposeDateAlternatives({ window: { startDate: null, endDate: null }, held: [], notBefore: "2026-09-01" }),
    ).toEqual([]);
  });

  it("gives up honestly beyond the horizon rather than proposing a window in another year", () => {
    // One commitment covering the whole horizon in both directions.
    const held = [project("p1", "2025-01-01", "2027-12-31")];
    expect(proposeDateAlternatives({ window, held, notBefore: "2025-01-01" })).toEqual([]);
    expect(DATE_SEARCH_HORIZON_DAYS).toBe(365);
  });
});

describe("crew alternatives — only a CLEAR verdict is offered as clear", () => {
  const cand = (id: string, name: string, verdict: ReservationVerdict): CrewCandidate => ({
    workerId: id,
    profileId: `profile-${id}`,
    name,
    verdict,
  });

  it("offers clear candidates first, unknown as unconfirmed, and never a colliding one", () => {
    const out = proposeCrewAlternatives({
      collidingWorkerId: "w0",
      candidates: [
        cand("w1", "Zita", clear),
        cand("w2", "Adam", unknown),
        cand("w3", "Bo", collidingVerdict([project("x", "2026-10-06", "2026-10-06")])),
        cand("w4", "Ann", clear),
      ],
    });
    expect(out.map((c) => [c.name, c.confidence])).toEqual([
      ["Ann", "clear"],
      ["Zita", "clear"],
      ["Adam", "unconfirmed"],
    ]);
  });

  it("never proposes the colliding person as their own replacement", () => {
    const out = proposeCrewAlternatives({
      collidingWorkerId: "w0",
      candidates: [cand("w0", "Self", clear)],
    });
    expect(out).toEqual([]);
  });

  it("is bounded — a proposal is not a roster", () => {
    const candidates = Array.from({ length: 30 }, (_, i) => cand(`w${i + 1}`, `Name ${String(i).padStart(2, "0")}`, clear));
    expect(proposeCrewAlternatives({ collidingWorkerId: "w0", candidates })).toHaveLength(MAX_CREW_ALTERNATIVES);
  });
});

describe("the composition — propose only around a KNOWN clash", () => {
  it("is not applicable when nothing collided", () => {
    const out = proposeAlternatives({
      verdict: clear,
      window,
      collidingWorkerId: "w0",
      held: [],
      candidates: [],
      notBefore: "2026-09-01",
    });
    expect(out.status).toBe("not_applicable");
    expect(out.dates).toEqual([]);
    expect(out.crew).toEqual([]);
  });

  it("is not applicable under an UNKNOWN verdict — no proposals built on an unread source (SEP-7)", () => {
    const out = proposeAlternatives({
      verdict: unknown,
      window,
      collidingWorkerId: "w0",
      held: [project("p1", "2026-10-07", "2026-10-12")],
      candidates: [{ workerId: "w1", profileId: "p", name: "Ann", verdict: clear }],
      notBefore: "2026-09-01",
    });
    expect(out.status).toBe("not_applicable");
  });

  it("proposes dates and crew under a collision, and reports how many were examined", () => {
    const held = [project("p1", "2026-10-07", "2026-10-12")];
    const out = proposeAlternatives({
      verdict: collidingVerdict(held),
      window,
      collidingWorkerId: "w0",
      held,
      candidates: [
        { workerId: "w0", profileId: "p0", name: "Self", verdict: clear },
        { workerId: "w1", profileId: "p1", name: "Ann", verdict: clear },
      ],
      notBefore: "2026-09-01",
    });
    expect(out.status).toBe("proposed");
    expect(out.windowDays).toBe(5);
    expect(out.crewExamined).toBe(1);
    expect(out.dates).toHaveLength(2);
    expect(out.crew.map((c) => c.name)).toEqual(["Ann"]);
  });

  it("says NONE when the search ran and found nothing — distinct from not having searched", () => {
    const held = [project("p1", "2025-01-01", "2027-12-31")];
    const out = proposeAlternatives({
      verdict: collidingVerdict(held),
      window,
      collidingWorkerId: "w0",
      held,
      candidates: [{ workerId: "w1", profileId: "p1", name: "Bo", verdict: collidingVerdict(held) }],
      notBefore: "2025-01-01",
    });
    expect(out.status).toBe("none");
    expect(out.crewExamined).toBe(1);
  });

  it("is deterministic — the same facts render the same way twice", () => {
    const held = [project("p1", "2026-10-07", "2026-10-12")];
    const input = {
      verdict: collidingVerdict(held),
      window,
      collidingWorkerId: "w0",
      held,
      candidates: [
        { workerId: "w2", profileId: "p2", name: "Zed", verdict: clear },
        { workerId: "w1", profileId: "p1", name: "Ann", verdict: unknown },
      ],
      notBefore: "2026-09-01",
    };
    expect(proposeAlternatives(input)).toEqual(proposeAlternatives(input));
  });
});
