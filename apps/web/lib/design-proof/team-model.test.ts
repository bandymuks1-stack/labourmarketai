import { describe, expect, it } from "vitest";

import { NEED } from "./product-fixtures";
import {
  addPerson,
  conflictOf,
  coverageOf,
  emptySeats,
  fitRank,
  inviteSeat,
  membersOf,
  removeSeat,
  replaceSeat,
  seatTotals,
} from "./team-model";
import { personById } from "./product-fixtures";

/**
 * TEAM FORMATION — the behaviour the screen depends on, pinned without a
 * browser. Seats are the only state; coverage, gaps, conflicts and "ready" are
 * derived from them.
 */
const TOTAL = NEED.roles.reduce((n, r) => n + r.count, 0);

describe("team formation model", () => {
  it("starts with every seat open and nothing covered", () => {
    const s = emptySeats();
    expect(seatTotals(s)).toEqual({ filled: 0, invited: 0, total: TOTAL, open: TOTAL });
    expect(coverageOf(s).every((c) => c.status === "missing")).toBe(true);
  });

  it("adding a candidate fills the first open seat of THEIR role", () => {
    const r = addPerson(emptySeats(), "tk");
    expect(r.result).toBe("added");
    expect(r.seats.scaf[0]).toEqual({ kind: "person", id: "tk" });
    expect(r.seats.scaf[1]).toEqual({ kind: "open" });
    expect(membersOf(r.seats)).toEqual([{ personId: "tk", role: "scaf", index: 0 }]);
  });

  it("coverage responds: confirmed work covers a capability, own records only is weaker, a gap stays visible", () => {
    let s = addPerson(emptySeats(), "is").seats; // site lead: confirmed leadership
    const lead = coverageOf(s).find((c) => c.cap === "Site leadership")!;
    expect(lead.status).toBe("covered");
    expect(coverageOf(s).find((c) => c.cap === "Safety planning")!.status).toBe("missing");

    s = addPerson(s, "ap").seats; // safety officer, confirmed safety planning
    expect(coverageOf(s).find((c) => c.cap === "Safety planning")!.status).toBe("covered");
    expect(coverageOf(s).find((c) => c.cap === "Electrical installation")!.status).toBe("missing");
  });

  it("a capability needed by several seats is covered only when enough people have it confirmed", () => {
    let s = addPerson(emptySeats(), "tk").seats; // scaffolder 1 of 3
    const work = (st: typeof s) => coverageOf(st).find((c) => c.cap === "Work at height")!;
    expect(work(s).status).not.toBe("covered");
    s = addPerson(s, "mt").seats;
    s = addPerson(s, "an2").seats; // 3 scaffolders, all confirmed at height
    expect(work(s).status).toBe("covered");
  });

  it("a role becomes full, and a further add is refused without changing anything", () => {
    let s = emptySeats();
    for (const id of ["tk", "mt", "an2"]) s = addPerson(s, id).seats;
    expect(s.scaf.every((x) => x.kind === "person")).toBe(true);
    const again = addPerson(s, "do"); // a fourth scaffolder
    expect(again.result).toBe("full");
    expect(again.seats).toBe(s);
  });

  it("refuses someone already on the team and someone no role fits", () => {
    const s = addPerson(emptySeats(), "is").seats;
    expect(addPerson(s, "is").result).toBe("already");
    expect(addPerson(emptySeats(), "lf").result).toBe("no-role"); // finishing trades: no seat asks for it
  });

  it("removing a person reopens their seat and the coverage they gave", () => {
    let s = addPerson(emptySeats(), "ap").seats;
    expect(coverageOf(s).find((c) => c.cap === "Safety planning")!.status).toBe("covered");
    s = removeSeat(s, "hse", 0);
    expect(s.hse[0]).toEqual({ kind: "open" });
    expect(coverageOf(s).find((c) => c.cap === "Safety planning")!.status).toBe("missing");
  });

  it("replacing swaps one person for another in the same seat, once", () => {
    let s = addPerson(emptySeats(), "mn").seats; // electrician
    s = replaceSeat(s, "elec", 0, "an1");
    expect(s.elec[0]).toEqual({ kind: "person", id: "an1" });
    expect(membersOf(s).map((m) => m.personId)).toEqual(["an1"]);
  });

  it("an invited seat is neither open nor held, and does not count as ready", () => {
    let s = inviteSeat(emptySeats(), "lead", 0);
    expect(seatTotals(s)).toMatchObject({ invited: 1, filled: 0 });
    expect(s.lead[0]).toEqual({ kind: "invited" });
    s = addPerson(s, "is").seats; // fills the invited seat
    expect(s.lead[0]).toEqual({ kind: "person", id: "is" });
  });

  it("the team is complete only when every seat is held and none is merely invited", () => {
    let s = emptySeats();
    const everyone = ["is", "tk", "mt", "an2", "mn", "an1", "ap"];
    for (const id of everyone.slice(0, -1)) s = addPerson(s, id).seats;
    const t = seatTotals(s);
    expect(t.open + t.invited).toBe(1);
    s = addPerson(s, everyone.at(-1)!).seats;
    const done = seatTotals(s);
    expect(done).toEqual({ filled: TOTAL, invited: 0, total: TOTAL, open: 0 });
    expect(coverageOf(s).every((c) => c.status === "covered")).toBe(true);
  });

  it("names a date clash on the person, never silently", () => {
    expect(conflictOf(personById("pz"))?.kind).toBe("busy");
    expect(conflictOf(personById("vk"))?.kind).toBe("late");
    expect(conflictOf(personById("tk"))).toBeNull();
  });

  it("ranks the right role and the available-now people first", () => {
    expect(fitRank(personById("mn"), "elec")).toBeGreaterThan(fitRank(personById("mn"), "scaf"));
    expect(fitRank(personById("mn"), "elec")).toBeGreaterThan(fitRank(personById("pz"), "elec"));
  });
});
