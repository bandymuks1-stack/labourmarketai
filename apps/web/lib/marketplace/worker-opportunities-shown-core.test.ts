import { describe, expect, it } from "vitest";

import {
  MAX_SHOWN_IDS_PER_CALL,
  normalizeShownIds,
  type MarketplaceSurface,
} from "./worker-opportunities-contract";
import {
  runMarkShown,
  type MarkShownPorts,
  type SeenWriteResult,
} from "./worker-opportunities-shown-core";

/**
 * Canonical marketplace "mark shown" behaviour (Stage B).
 *
 * These are real behaviour tests, not static pins: the core is pure over
 * injected ports, so every honesty rule is exercised for real without a
 * database, a mock framework or a running server.
 */

/** Distinct, structurally valid uuids for bulk cases. */
const uuid = (n: number): string => {
  const h = n.toString(16).padStart(8, "0");
  return `${h}-0000-4000-8000-000000000000`;
};

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function ports(result: SeenWriteResult | (() => never)) {
  const calls: string[][] = [];
  const reported: { surface: string; message: string }[] = [];
  const p: MarkShownPorts = {
    writeSeen: async (ids) => {
      calls.push([...ids]);
      if (typeof result === "function") result();
      return result as SeenWriteResult;
    },
    reportUnexpected: (d) => reported.push(d),
  };
  return { p, calls, reported };
}

const surface: MarketplaceSurface = "conversation";

describe("normalizeShownIds — only real, de-duplicated ids reach the store", () => {
  it("drops anything that is not a uuid", () => {
    expect(normalizeShownIds([A, "not-a-uuid", "", "42", B])).toEqual(
      [A, B].sort(),
    );
  });

  it("de-duplicates", () => {
    expect(normalizeShownIds([A, A, A])).toEqual([A]);
  });

  it("is order-insensitive — the same displayed set yields the same payload", () => {
    expect(normalizeShownIds([C, A, B])).toEqual(normalizeShownIds([B, C, A]));
  });

  it("caps at the store's own hard bound", () => {
    const many = Array.from({ length: MAX_SHOWN_IDS_PER_CALL + 25 }, (_, i) =>
      uuid(i),
    );
    expect(new Set(many).size).toBe(many.length); // the fixture is really distinct
    expect(normalizeShownIds(many).length).toBe(MAX_SHOWN_IDS_PER_CALL);
  });
});

describe("mark shown — only what was SHOWN is reported", () => {
  it("passes exactly the normalized shown set to the store", async () => {
    const { p, calls } = ports({ kind: "ok", marked: 2 });
    const out = await runMarkShown(p, { surface, shownRequestIds: [B, A, A] });
    expect(calls).toEqual([[A, B]]);
    expect(out).toEqual({
      available: true,
      persisted: true,
      reason: "persisted",
      marked: 2,
    });
  });

  it("an empty shown set is `nothing_shown` — never a store write, never a claim about availability", async () => {
    const { p, calls, reported } = ports({ kind: "ok", marked: 0 });
    const out = await runMarkShown(p, { surface, shownRequestIds: [] });
    expect(calls).toEqual([]);
    expect(out).toEqual({
      available: null,
      persisted: false,
      reason: "nothing_shown",
      marked: 0,
    });
    expect(reported).toEqual([]);
  });

  it("a set of only invalid ids is `nothing_shown`, not a write", async () => {
    const { p, calls } = ports({ kind: "ok", marked: 0 });
    const out = await runMarkShown(p, {
      surface,
      shownRequestIds: ["x", "", "1234"],
    });
    expect(calls).toEqual([]);
    expect(out.reason).toBe("nothing_shown");
  });
});

describe("mark shown — idempotency", () => {
  it("a repeat report of the same displayed rows sends an identical payload", async () => {
    const { p, calls } = ports({ kind: "ok", marked: 3 });
    const first = await runMarkShown(p, {
      surface,
      shownRequestIds: [A, B, C],
    });
    const second = await runMarkShown(p, {
      surface,
      // Same displayed set, different order, with a duplicate.
      shownRequestIds: [C, A, B, A],
    });
    expect(calls[0]).toEqual(calls[1]);
    expect(second).toEqual(first);
  });

  it("marking the same row again is a no-op at the store, so the outcome stays honest", async () => {
    // The store reports 0 newly-inserted rows on a repeat (conflict = no-op,
    // first-seen preserved). That is still a successful, persisted call.
    const { p } = ports({ kind: "ok", marked: 0 });
    const out = await runMarkShown(p, { surface, shownRequestIds: [A] });
    expect(out).toEqual({
      available: true,
      persisted: true,
      reason: "persisted",
      marked: 0,
    });
  });
});

describe("mark shown — degradation is honest and narrow", () => {
  it("an unapplied store yields the documented feature-unavailable contract", async () => {
    const { p, reported } = ports({ kind: "feature_unavailable" });
    const out = await runMarkShown(p, { surface, shownRequestIds: [A] });
    expect(out).toEqual({
      available: false,
      persisted: false,
      reason: "feature_unavailable",
      marked: 0,
    });
    // An unapplied owner-gated migration is not an error — nothing to report.
    expect(reported).toEqual([]);
  });

  it("never claims `persisted` on any non-ok classification", async () => {
    for (const result of [
      { kind: "feature_unavailable" },
      { kind: "not_authenticated" },
      { kind: "unexpected_error", message: "boom" },
    ] as SeenWriteResult[]) {
      const { p } = ports(result);
      const out = await runMarkShown(p, { surface, shownRequestIds: [A] });
      expect(out.persisted, result.kind).toBe(false);
      expect(out.marked, result.kind).toBe(0);
    }
  });

  it("a missing session is its own reason, not `feature_unavailable`", async () => {
    const { p, reported } = ports({ kind: "not_authenticated" });
    const out = await runMarkShown(p, { surface, shownRequestIds: [A] });
    expect(out.reason).toBe("not_authenticated");
    expect(out.available).toBeNull();
    expect(reported).toEqual([]);
  });
});

describe("mark shown — unexpected failures are never swallowed", () => {
  it("a classified unexpected error is reported AND surfaced in the outcome", async () => {
    const { p, reported } = ports({
      kind: "unexpected_error",
      message: "connection reset",
    });
    const out = await runMarkShown(p, { surface, shownRequestIds: [A] });
    expect(out).toEqual({
      available: null,
      persisted: false,
      reason: "unexpected_error",
      marked: 0,
    });
    expect(reported).toEqual([
      { surface: "conversation", message: "connection reset" },
    ]);
  });

  it("a throwing adapter is reported, not silently degraded", async () => {
    const { p, reported } = ports(() => {
      throw new Error("adapter exploded");
    });
    const out = await runMarkShown(p, {
      surface: "opportunities_board",
      shownRequestIds: [A],
    });
    expect(out.reason).toBe("unexpected_error");
    expect(out.available).toBeNull();
    expect(reported).toEqual([
      { surface: "opportunities_board", message: "adapter exploded" },
    ]);
  });

  it("an unexpected failure is NEVER reported as the approved degradation", async () => {
    const { p } = ports({ kind: "unexpected_error", message: "x" });
    const out = await runMarkShown(p, { surface, shownRequestIds: [A] });
    expect(out.reason).not.toBe("feature_unavailable");
    // ...and it must not assert the store is absent, because it did not learn that.
    expect(out.available).not.toBe(false);
  });
});

describe("mark shown — one contract for every surface", () => {
  it("all four surfaces receive the identical outcome shape for the identical store answer", async () => {
    const surfaces: MarketplaceSurface[] = [
      "conversation",
      "opportunities_board",
      "dashboard_recommendations",
      "journal_context",
    ];
    const outcomes = [];
    for (const s of surfaces) {
      const { p } = ports({ kind: "feature_unavailable" });
      outcomes.push(await runMarkShown(p, { surface: s, shownRequestIds: [A] }));
    }
    for (const o of outcomes) expect(o).toEqual(outcomes[0]);
  });

  it("the surface tag travels into the failure report so an outage is attributable", async () => {
    const { p, reported } = ports({ kind: "unexpected_error", message: "m" });
    await runMarkShown(p, {
      surface: "journal_context",
      shownRequestIds: [A],
    });
    expect(reported[0].surface).toBe("journal_context");
  });
});
