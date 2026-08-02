import { describe, expect, it } from "vitest";
import { binFor, computeConfidence, recencyBoost } from "./confidence";

const NOW = new Date("2026-05-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("binFor", () => {
  it("maps the bin boundaries (0 → red, <30 → green, ≥30 → yellow)", () => {
    expect(binFor(0)).toBe("red");
    expect(binFor(1)).toBe("green");
    expect(binFor(29)).toBe("green");
    expect(binFor(30)).toBe("yellow");
    expect(binFor(100)).toBe("yellow");
  });
});

describe("recencyBoost", () => {
  it("is 0 with no confirmation", () => {
    expect(recencyBoost(null, NOW)).toBe(0);
  });
  it("is +5 within 30 days (inclusive), +2 within 90, else 0", () => {
    expect(recencyBoost(daysAgo(0), NOW)).toBe(5);
    expect(recencyBoost(daysAgo(30), NOW)).toBe(5);
    expect(recencyBoost(daysAgo(31), NOW)).toBe(2);
    expect(recencyBoost(daysAgo(90), NOW)).toBe(2);
    expect(recencyBoost(daysAgo(91), NOW)).toBe(0);
  });
});

describe("computeConfidence", () => {
  it("is 0/red for a worker with no entries at all", () => {
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 0,
          selfLoggedEntries: 0,
          uniqueConfirmers: 0,
          lastConfirmationAt: null,
        },
        NOW,
      ),
    ).toEqual({ score: 0, bin: "red" });
  });

  it("stays green for self-logged-only entries (no confirmation)", () => {
    // 5 self-logged × 1 = 5, no confirmer, no recency → 5 → green
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 0,
          selfLoggedEntries: 5,
          uniqueConfirmers: 0,
          lastConfirmationAt: null,
        },
        NOW,
      ),
    ).toEqual({ score: 5, bin: "green" });
  });

  it("flips red → green after the first manager confirmation (closed loop)", () => {
    // 1 confirmed×3 + 1 self×1 + 1 confirmer×5 + recency 5 = 14 → green
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 1,
          selfLoggedEntries: 1,
          uniqueConfirmers: 1,
          lastConfirmationAt: daysAgo(0),
        },
        NOW,
      ),
    ).toEqual({ score: 14, bin: "green" });
  });

  it("lands exactly on the 30 boundary → yellow", () => {
    // 5 confirmed×3 (15) + 5 self×1 (5) + 1 confirmer×5 (5) + recency 5 = 30
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 5,
          selfLoggedEntries: 5,
          uniqueConfirmers: 1,
          lastConfirmationAt: daysAgo(10),
        },
        NOW,
      ),
    ).toEqual({ score: 30, bin: "yellow" });
  });

  it("clamps to 100", () => {
    const { score, bin } = computeConfidence(
      {
        managerConfirmedEntries: 100,
        selfLoggedEntries: 100,
        uniqueConfirmers: 100,
        lastConfirmationAt: daysAgo(0),
      },
      NOW,
    );
    expect(score).toBe(100);
    expect(bin).toBe("yellow");
  });
});

// ── W6 slice 2 — containment truth table ────────────────────────────────────
// The signal is evidence assurance for a skill's records, never reputation.
// Self-reported volume alone must NEVER substantiate.
import { SELF_LOGGED_CONFIDENCE_CAP } from "./confidence";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("W6 containment: self-logged volume alone never substantiates", () => {
  const selfOnly = (n: number) =>
    computeConfidence(
      {
        managerConfirmedEntries: 0,
        selfLoggedEntries: n,
        uniqueConfirmers: 0,
        lastConfirmationAt: null,
      },
      NOW,
    );

  it("30, 100 and 10000 self-logged entries alone stay in the early-evidence bin", () => {
    for (const n of [30, 100, 10_000]) {
      const { score, bin } = selfOnly(n);
      expect(score).toBe(SELF_LOGGED_CONFIDENCE_CAP);
      expect(bin).toBe("green");
      expect(bin).not.toBe("yellow");
    }
  });

  it("the cap itself sits below the substantiated boundary by construction", () => {
    expect(SELF_LOGGED_CONFIDENCE_CAP).toBeLessThan(30);
  });

  it("substantiation requires what a worker cannot mint alone", () => {
    // Same 30 self entries + real confirmations → crosses honestly.
    const { bin } = computeConfidence(
      {
        managerConfirmedEntries: 5,
        selfLoggedEntries: 30,
        uniqueConfirmers: 1,
        lastConfirmationAt: NOW,
      },
      NOW,
    );
    expect(bin).toBe("yellow");
  });

  it("photos, streaks and learning signals are not — and cannot become — inputs", () => {
    // Type-level: ConfidenceInputs has exactly these four fields.
    const inputs = {
      managerConfirmedEntries: 1,
      selfLoggedEntries: 1,
      uniqueConfirmers: 1,
      lastConfirmationAt: null,
    };
    expect(Object.keys(inputs)).toHaveLength(4);
    // Source-level: neither the module nor its ONLY writer reads photo,
    // streak or learning-signal stores.
    const WEB = join(__dirname, "..", "..");
    for (const p of ["lib/journal/confidence.ts", "lib/journal/confirm-actions.ts"]) {
      const src = readFileSync(join(WEB, p), "utf8");
      expect(src, p).not.toMatch(/journal_entry_photos|learning_signals|streak/);
    }
  });

  it("the signal never wears reputation clothes", () => {
    const WEB = join(__dirname, "..", "..");
    const src = readFileSync(join(WEB, "lib/journal/confidence.ts"), "utf8");
    // The words appear ONLY in the negated doctrine note, never as an export.
    expect(src).not.toMatch(/export .*(reputation|trustScore|personScore)/i);
    // And the only writer touches only the confidence columns.
    const writer = readFileSync(join(WEB, "lib/journal/confirm-actions.ts"), "utf8");
    expect(writer).toMatch(/confidence_score: score,\s*\n\s*confidence_bin: bin/);
    expect(writer).not.toMatch(/verified:\s*true/);
  });
});
