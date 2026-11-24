import { describe, expect, it } from "vitest";
import {
  selfSignalsForViewer,
  isShareable,
  aggregateSignals,
  marketSignals,
  type NormalizedSignal,
  type SignalType,
  type VisibilityLevel,
} from "./signal-model";

function sig(p: Partial<NormalizedSignal> & { signalId: string }): NormalizedSignal {
  return {
    signalType: "preferred_location" as SignalType,
    ownerType: "profile",
    ownerId: "owner-A",
    country: "LT",
    region: null,
    city: null,
    granularity: "country",
    visibilityLevel: "self_only" as VisibilityLevel,
    count: 1,
    aggregatedCount: null,
    canShowExact: false,
    sourceStatus: "self_declared",
    updatedAt: null,
    ...p,
  };
}

describe("owner self view vs other users", () => {
  const signals = [
    sig({ signalId: "a1", ownerId: "owner-A", visibilityLevel: "self_only" }),
    sig({ signalId: "a2", ownerId: "owner-A", visibilityLevel: "private" }),
    sig({ signalId: "b1", ownerId: "owner-B", visibilityLevel: "self_only" }),
  ];
  it("owner sees their OWN self_only/private signals", () => {
    const mine = selfSignalsForViewer(signals, { profileId: "owner-A", isAdmin: false });
    expect(mine.map((s) => s.signalId).sort()).toEqual(["a1", "a2"]);
  });
  it("another user does NOT see them", () => {
    const theirs = selfSignalsForViewer(signals, { profileId: "owner-B", isAdmin: false });
    expect(theirs.map((s) => s.signalId)).toEqual(["b1"]);
    expect(theirs.some((s) => s.ownerId === "owner-A")).toBe(false);
  });
  it("anonymous viewer sees no individual self_only signals", () => {
    expect(selfSignalsForViewer(signals, { profileId: null, isAdmin: false })).toEqual([]);
  });
  it("admin sees all (diagnostic)", () => {
    expect(selfSignalsForViewer(signals, { profileId: null, isAdmin: true })).toHaveLength(3);
  });
});

describe("private / self_only never reach shared output", () => {
  it("self_only + private + company_only are not shareable", () => {
    for (const v of ["private", "self_only", "company_only", "admin_only", "plan_gated"] as VisibilityLevel[]) {
      expect(isShareable(sig({ signalId: v, visibilityLevel: v }))).toBe(false);
    }
  });
  it("aggregated / region_visible / city_visible are shareable (with a country)", () => {
    for (const v of ["aggregated", "region_visible", "city_visible"] as VisibilityLevel[]) {
      expect(isShareable(sig({ signalId: v, visibilityLevel: v, country: "LT", region: "X", city: "Y" }))).toBe(true);
    }
  });
});

describe("login consent gating", () => {
  it("revoked / not_requested login signals are excluded from shared output", () => {
    for (const status of ["revoked", "not_requested"]) {
      const s = sig({
        signalId: `login-${status}`,
        signalType: "login_location",
        ownerType: "login",
        visibilityLevel: "aggregated", // even if mislabeled shareable…
        sourceStatus: status,
      });
      expect(isShareable(s)).toBe(false); // …consent gate still blocks it
    }
  });
  it("consented login signal IS shareable", () => {
    const s = sig({
      signalId: "login-ok",
      signalType: "login_location",
      ownerType: "login",
      visibilityLevel: "aggregated",
      sourceStatus: "consented",
    });
    expect(isShareable(s)).toBe(true);
  });
});

describe("min-bucket aggregation threshold", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      sig({ signalId: `agg-${i}`, ownerId: `u${i}`, visibilityLevel: "aggregated", country: "LT" }),
    );
  it("a bucket below the threshold is NOT shown", () => {
    expect(aggregateSignals(make(2), 3)).toEqual([]);
  });
  it("a bucket at/above the threshold IS shown, anonymised", () => {
    const out = aggregateSignals(make(3), 3);
    expect(out).toHaveLength(1);
    expect(out[0].aggregatedCount).toBe(3);
    expect(out[0].ownerId).toBeNull();
    expect(out[0].visibilityLevel).toBe("aggregated");
  });
  it("region_visible buckets at region; country fallback otherwise", () => {
    const rows = [
      sig({ signalId: "r1", ownerId: "u1", visibilityLevel: "region_visible", country: "LT", region: "Vilnius" }),
      sig({ signalId: "r2", ownerId: "u2", visibilityLevel: "region_visible", country: "LT", region: "Vilnius" }),
      sig({ signalId: "r3", ownerId: "u3", visibilityLevel: "region_visible", country: "LT", region: "Vilnius" }),
    ];
    const out = aggregateSignals(rows, 3);
    expect(out).toHaveLength(1);
    expect(out[0].granularity).toBe("region");
    expect(out[0].region).toBe("Vilnius");
  });
});

describe("no exact location on shared output", () => {
  it("aggregated signals never allow an exact point", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      sig({ signalId: `c${i}`, ownerId: `u${i}`, visibilityLevel: "city_visible", country: "LT", region: "V", city: "Vilnius", canShowExact: true }),
    );
    const out = marketSignals(rows, 3);
    expect(out).toHaveLength(1);
    expect(out[0].canShowExact).toBe(false);
  });
  it("login output never carries city-exact in shared form", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      sig({ signalId: `l${i}`, ownerId: `u${i}`, signalType: "login_location", ownerType: "login", visibilityLevel: "aggregated", sourceStatus: "consented", country: "LT" }),
    );
    const out = marketSignals(rows, 3);
    expect(out.every((s) => s.canShowExact === false)).toBe(true);
  });
});

describe("signals are not merged into one generic location", () => {
  it("different signal types stay distinct buckets in the same place", () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => sig({ signalId: `p${i}`, ownerId: `u${i}`, signalType: "preferred_location", visibilityLevel: "aggregated", country: "LT" })),
      ...Array.from({ length: 3 }, (_, i) => sig({ signalId: `d${i}`, ownerId: `u${i}`, signalType: "company_need_location", ownerType: "demand", visibilityLevel: "aggregated", country: "LT" })),
    ];
    const out = marketSignals(rows, 3);
    const types = out.map((s) => s.signalType).sort();
    expect(types).toEqual(["company_need_location", "preferred_location"]);
  });
});
