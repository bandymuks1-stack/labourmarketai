import { describe, expect, it } from "vitest";

import { decideOpenNeedsGate } from "./open-needs-gate";
import { openNeedsUsageView } from "./open-needs-usage";

describe("openNeedsUsageView", () => {
  it("shows nothing while billing is not enforced (pilot)", () => {
    const gate = decideOpenNeedsGate({ enforced: false, planKey: "free_organization", limit: 1, used: null });
    expect(openNeedsUsageView(gate)).toEqual({ visible: false });
    expect(openNeedsUsageView(null)).toEqual({ visible: false });
  });
  it("shows used / limit / remaining under the limit", () => {
    const gate = decideOpenNeedsGate({ enforced: true, planKey: "business", limit: 10, used: 4 });
    expect(openNeedsUsageView(gate)).toEqual({ visible: true, used: 4, limit: 10, remaining: 6, atLimit: false, next: null });
  });
  it("at the free limit offers the upgrade step", () => {
    const gate = decideOpenNeedsGate({ enforced: true, planKey: "free_organization", limit: 1, used: 1 });
    expect(openNeedsUsageView(gate)).toEqual({ visible: true, used: 1, limit: 1, remaining: 0, atLimit: true, next: "upgrade" });
  });
  it("mirrors the gate's own next step at the paid ceiling", () => {
    const gate = decideOpenNeedsGate({ enforced: true, planKey: "business", limit: 10, used: 10 });
    const v = openNeedsUsageView(gate);
    expect(v).toMatchObject({ visible: true, atLimit: true, remaining: 0 });
    if (v.visible) expect(v.next).toBe(gate.allowed ? null : gate.next);
  });
  it("an unreadable count fails closed exactly like the gate (at limit)", () => {
    const gate = decideOpenNeedsGate({ enforced: true, planKey: "free_organization", limit: 1, used: null });
    expect(openNeedsUsageView(gate)).toMatchObject({ visible: true, atLimit: true });
  });
  it("unlimited plan shows nothing", () => {
    const gate = decideOpenNeedsGate({ enforced: true, planKey: "x", limit: null, used: 3 });
    expect(openNeedsUsageView(gate)).toEqual({ visible: false });
  });
});
