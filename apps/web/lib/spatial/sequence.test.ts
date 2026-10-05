import { describe, expect, it } from "vitest";

import {
  EVENTS,
  FRAMES,
  LANES,
  camAt,
  frameOpacity,
  laneHoursAt,
  needOffset,
  project,
  stateAt,
  STATES,
} from "./sequence";

describe("spatial sequence", () => {
  it("the camera never teleports: adjacent samples stay close", () => {
    let prev = camAt(0);
    for (let i = 1; i <= 4000; i++) {
      const c = camAt(i / 4000);
      expect(Math.abs(c.t - prev.t)).toBeLessThan(40);
      expect(Math.abs(c.r - prev.r)).toBeLessThan(60);
      expect(Math.abs(c.yaw - prev.yaw)).toBeLessThan(0.6);
      expect(Math.abs(c.fx - prev.fx)).toBeLessThan(40);
      prev = c;
    }
  });

  it("is a pure function of progress (reversible)", () => {
    for (const p of [0, 0.13, 0.4, 0.6, 0.81, 1]) expect(camAt(p)).toEqual(camAt(p));
  });

  it("projects the point the camera looks at to the centre of the view", () => {
    const c = camAt(0);
    const q = project(c, 1440, 900, c.fx, c.fy, -c.t);
    expect(q.visible).toBe(true);
    expect(q.x).toBeCloseTo(720, 5);
    expect(q.y).toBeCloseTo(450, 5);
  });

  it("a nearer point is larger than a farther one", () => {
    const c = camAt(0);
    const near = project(c, 1440, 900, 100, 0, 100);
    const far = project(c, 1440, 900, 100, 0, -800);
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it("the history is a corridor in order, and the need lies ahead of it", () => {
    const person = FRAMES.filter((f) => f.kind === "person").map((f) => f.s);
    expect([...person].sort((a, b) => a - b)).toEqual(person);
    const need = FRAMES.filter((f) => f.kind === "need").map((f) => f.s);
    for (const s of need) expect(s).toBeGreaterThan(person.at(-1)!);
  });

  it("the need world converges onto the corridor axis and stays there", () => {
    expect(needOffset(0.5)).toBeGreaterThan(1000);
    expect(needOffset(0.81)).toBeCloseTo(0, 5);
    expect(needOffset(1)).toBeCloseTo(0, 5);
  });

  it("only the frame the camera is at is opaque in a dolly; the next one waits", () => {
    const at = (p: number, id: string) => frameOpacity(FRAMES.find((f) => f.id === id)!, camAt(p), p);
    expect(at(0.03, "F0")).toBeCloseTo(1, 1);
    expect(at(0.03, "F4")).toBeLessThan(0.05);
    expect(at(0.16, "F1")).toBeCloseTo(1, 1);
    expect(at(0.16, "F0")).toBeLessThan(0.05);
  });

  it("lanes only gain hours (a capability is never un-earned)", () => {
    for (const lane of LANES) {
      let prev = 0;
      for (let s = -300; s <= 7000; s += 50) {
        const h = laneHoursAt(lane, s);
        expect(h).toBeGreaterThanOrEqual(prev);
        prev = h;
      }
    }
  });

  it("events happen in causal order: work → evidence → confirmation → bridges → agreement → new evidence", () => {
    expect(EVENTS.trackFrom).toBeLessThan(EVENTS.trackTo);
    expect(EVENTS.trackTo).toBeLessThan(EVENTS.liftFrom);
    expect(EVENTS.liftTo).toBeLessThanOrEqual(EVENTS.dockFrom);
    expect(EVENTS.dockTo).toBeLessThan(EVENTS.confirmAt);
    expect(EVENTS.confirmAt).toBeLessThan(EVENTS.beams[0]!);
    expect(EVENTS.beams.at(-1)!).toBeLessThan(EVENTS.stamps.interest);
    expect(EVENTS.stamps.interest).toBeLessThan(EVENTS.stamps.terms);
    expect(EVENTS.stamps.terms).toBeLessThan(EVENTS.stamps.agreed);
    expect(EVENTS.stamps.agreed).toBeLessThan(EVENTS.newLiftFrom);
    expect(EVENTS.newLiftTo).toBeLessThan(EVENTS.newDockTo);
  });

  it("walks the product's states in order", () => {
    const seen: string[] = [];
    for (let i = 0; i <= 1000; i++) {
      const s = stateAt(i / 1000);
      if (seen.at(-1) !== s) seen.push(s);
    }
    expect(seen).toEqual([...STATES]);
  });
});
