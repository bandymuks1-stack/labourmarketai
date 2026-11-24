import { describe, expect, it } from "vitest";

import {
  reserveCapacity,
  type HeldTime,
  type ReservationVerdict,
} from "@/lib/workforce/commitment-reservation";

const project = (id: string, start: string | null, end: string | null, label = "Site"): HeldTime => ({
  source: "project",
  sourceId: id,
  label,
  startDate: start,
  endDate: end,
});
const booking = (id: string, start: string, end: string | null): HeldTime => ({
  source: "booking",
  sourceId: id,
  label: null,
  startDate: start,
  endDate: end,
});
const absence = (id: string, start: string, end: string | null): HeldTime => ({
  source: "absence",
  sourceId: id,
  label: null,
  startDate: start,
  endDate: end,
});

const gapReasons = (v: ReservationVerdict) => v.gaps.map((g) => g.reason);

describe("a collision is reported with the days it really shares", () => {
  it("finds the overlap and names both ends of it", () => {
    const v = reserveCapacity({
      window: { startDate: "2026-10-05", endDate: "2026-10-20" },
      held: [project("p1", "2026-10-01", "2026-10-10")],
    });
    expect(v.state).toBe("collides");
    expect(v.collisions).toHaveLength(1);
    expect(v.collisions[0].overlapStart).toBe("2026-10-05");
    expect(v.collisions[0].overlapEnd).toBe("2026-10-10");
    expect(v.collisions[0].label).toBe("Site");
  });

  it("touching edges ARE an overlap, exactly as the booking accept guard says", () => {
    // One ends the day the other starts. The DB guard treats that as a
    // conflict (inclusive dateranges); if this file disagreed, the calendar
    // and the reservation view would contradict each other about the same
    // two rows.
    const v = reserveCapacity({
      window: { startDate: "2026-10-10", endDate: "2026-10-15" },
      held: [booking("b1", "2026-10-01", "2026-10-10")],
    });
    expect(v.state).toBe("collides");
    expect(v.collisions[0].overlapStart).toBe("2026-10-10");
  });

  it("an open-ended commitment covers its start day only, never forever", () => {
    // `effectiveEndDay` resolves a null end to the start. Treating null as
    // "until the end of time" would make one undated booking swallow every
    // future plan the person has.
    const v = reserveCapacity({
      window: { startDate: "2026-11-01", endDate: "2026-11-30" },
      held: [booking("b1", "2026-10-31", null)],
    });
    expect(v.state).toBe("clear");
  });

  it("a day-shaped window and a day-shaped commitment on the same day collide", () => {
    const v = reserveCapacity({
      window: { startDate: "2026-12-01", endDate: null },
      held: [absence("a1", "2026-12-01", null)],
    });
    expect(v.state).toBe("collides");
    expect(v.collisions[0].overlapStart).toBe("2026-12-01");
    expect(v.collisions[0].overlapEnd).toBe("2026-12-01");
  });

  it("collisions come back in a deterministic order", () => {
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-31" },
      held: [
        project("z", "2026-10-20", "2026-10-25"),
        booking("a", "2026-10-02", "2026-10-03"),
        absence("m", "2026-10-02", "2026-10-02"),
      ],
    });
    expect(v.collisions.map((c) => c.sourceId)).toEqual(["a", "m", "z"]);
  });
});

describe("clear means every source answered — SEP-7", () => {
  it("no commitments and no gaps is the only route to clear", () => {
    const v = reserveCapacity({ window: { startDate: "2026-10-01", endDate: "2026-10-05" }, held: [] });
    expect(v).toEqual({ state: "clear", collisions: [], gaps: [] });
  });

  it("an unreadable source can never produce clear, even with nothing found", () => {
    // The defect this exists for: a failed read rendered as an empty
    // schedule, which reads to a manager as "this person is free".
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-05" },
      held: [],
      unreadableSources: ["absence"],
    });
    expect(v.state).toBe("unknown");
    expect(gapReasons(v)).toEqual(["source_unreadable"]);
  });

  it("an undated window is unknown, not clear", () => {
    const v = reserveCapacity({
      window: { startDate: null, endDate: null },
      held: [booking("b1", "2026-10-01", "2026-10-09")],
    });
    expect(v.state).toBe("unknown");
    expect(gapReasons(v)).toEqual(["undated_window"]);
    expect(v.collisions).toEqual([]);
  });

  it("an undated COMMITMENT is named, never dropped", () => {
    // A project assignment to a project nobody dated is a real commitment.
    // The capacity reader drops it (it will not invent a band); a reservation
    // verdict must still say it could not account for it.
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-05" },
      held: [project("p-undated", null, null, "Undated site")],
    });
    expect(v.state).toBe("unknown");
    expect(v.gaps).toEqual([
      { reason: "undated_commitment", source: "project", sourceId: "p-undated", label: "Undated site" },
    ]);
  });

  it("a real collision still wins over an incomplete read, and the gap is kept", () => {
    // The state says the strongest true thing (there IS a collision) without
    // discarding the fact that the answer is also incomplete.
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-05" },
      held: [booking("b1", "2026-10-02", "2026-10-03")],
      unreadableSources: ["absence"],
    });
    expect(v.state).toBe("collides");
    expect(v.collisions).toHaveLength(1);
    expect(gapReasons(v)).toEqual(["source_unreadable"]);
  });
});

describe("the verdict cannot express a refusal — SEP-2", () => {
  it("every state is informational", () => {
    const states = new Set<string>();
    for (const held of [[], [booking("b", "2026-10-01", "2026-10-02")]]) {
      states.add(reserveCapacity({ window: { startDate: "2026-10-01", endDate: "2026-10-05" }, held }).state);
    }
    states.add(reserveCapacity({ window: { startDate: null, endDate: null }, held: [] }).state);
    expect([...states].sort()).toEqual(["clear", "collides", "unknown"]);
    // There is deliberately no "blocked" / "refused" / "forbidden" state. If
    // one ever appears, a planner has been turned into a gate.
    expect([...states]).not.toContain("blocked");
  });
});

describe("re-checking your own commitment does not report you against yourself", () => {
  it("an excluded source id is not a collision", () => {
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-10" },
      held: [project("p1", "2026-10-01", "2026-10-10")],
      exclude: ["p1"],
    });
    expect(v.state).toBe("clear");
  });

  it("excluding one does not hide the others", () => {
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-10" },
      held: [project("p1", "2026-10-01", "2026-10-10"), booking("b1", "2026-10-04", "2026-10-06")],
      exclude: ["p1"],
    });
    expect(v.state).toBe("collides");
    expect(v.collisions.map((c) => c.sourceId)).toEqual(["b1"]);
  });
});

describe("absence never carries a reason", () => {
  it("the label of an absence collision stays null through the model", () => {
    // The employer read never fetches `note` or `absence_type`; this asserts
    // the model adds nothing back. An employer learns THAT someone is
    // unavailable, never why.
    const v = reserveCapacity({
      window: { startDate: "2026-10-01", endDate: "2026-10-05" },
      held: [absence("a1", "2026-10-02", "2026-10-04")],
    });
    expect(v.collisions[0].label).toBeNull();
  });
});
