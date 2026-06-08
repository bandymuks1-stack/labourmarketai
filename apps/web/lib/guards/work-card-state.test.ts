import { describe, expect, it } from "vitest";
import {
  deriveWorkCardState,
  STALE_AFTER_DAYS,
  type WorkCardSignals,
} from "../worker/work-card-state";

/**
 * Pure-engine guard for "Mano darbo kortelė" (slice work-card-state-aware-v1).
 *
 * Pins the product principle: ask only what the system does not know, never
 * re-ask saved data, never show more than one next action, and treat stale data
 * as a small confirmation — not a restart.
 */

const NOW = 1_000_000_000_000; // fixed epoch ms; no Date.now() in pure logic
const DAY = 24 * 60 * 60 * 1000;

const EMPTY: WorkCardSignals = {
  hasProfession: false,
  skillsCount: 0,
  availabilitySet: false,
  locationSet: false,
  paySet: false,
  evidenceCount: 0,
  confirmedAtMs: null,
};

const FULL: WorkCardSignals = {
  hasProfession: true,
  skillsCount: 4,
  availabilitySet: true,
  locationSet: true,
  paySet: true,
  evidenceCount: 3,
  confirmedAtMs: NOW - 1 * DAY,
};

describe("state classification", () => {
  it("new: nothing saved → guided path", () => {
    expect(deriveWorkCardState(EMPTY, NOW).state).toBe("new");
  });

  it("returning: any one dimension saved → continuity, not new", () => {
    const s = { ...EMPTY, hasProfession: true, skillsCount: 1 };
    expect(deriveWorkCardState(s, NOW).state).toBe("returning");
  });

  it("returning: even a single non-work dimension started counts as continuity", () => {
    const s = { ...EMPTY, paySet: true, confirmedAtMs: NOW - 1 * DAY };
    expect(deriveWorkCardState(s, NOW).state).toBe("returning");
  });

  it("returning: fresh full card is not stale", () => {
    expect(deriveWorkCardState(FULL, NOW).state).toBe("returning");
  });
});

describe("staleness is a small confirmation, never a restart", () => {
  it(`stale: time-sensitive data confirmed > ${STALE_AFTER_DAYS}d ago`, () => {
    const s = { ...FULL, confirmedAtMs: NOW - (STALE_AFTER_DAYS + 1) * DAY };
    const d = deriveWorkCardState(s, NOW);
    expect(d.state).toBe("stale");
    // confirms the time-sensitive dims only (not profession/evidence)
    expect(d.staleDims).toEqual(["availability", "location", "pay"]);
  });

  it("just under the threshold is still returning", () => {
    const s = { ...FULL, confirmedAtMs: NOW - (STALE_AFTER_DAYS - 1) * DAY };
    expect(deriveWorkCardState(s, NOW).state).toBe("returning");
  });

  it("a new card never goes stale (no onboarding restart via staleness)", () => {
    const s = { ...EMPTY, confirmedAtMs: NOW - 999 * DAY };
    expect(deriveWorkCardState(s, NOW).state).toBe("new");
  });

  it("no time-sensitive data set → never stale (only profession/evidence)", () => {
    const s: WorkCardSignals = {
      ...EMPTY,
      hasProfession: true,
      skillsCount: 2,
      evidenceCount: 1,
      confirmedAtMs: NOW - 999 * DAY,
    };
    expect(deriveWorkCardState(s, NOW).state).toBe("returning");
  });

  it("null confirmedAt (unsaved / pre-migration) is never stale", () => {
    const s = { ...FULL, confirmedAtMs: null };
    expect(deriveWorkCardState(s, NOW).state).toBe("returning");
  });
});

describe("ask only what is unknown — clear vs missing", () => {
  it("clear lists only saved dimensions; missing lists only unsaved", () => {
    const s: WorkCardSignals = {
      ...EMPTY,
      hasProfession: true,
      skillsCount: 2,
      paySet: true,
    };
    const d = deriveWorkCardState(s, NOW);
    expect(d.clear).toEqual(["work", "pay"]);
    expect(d.missing).toEqual(["availability", "location", "evidence"]);
  });

  it("a saved dimension is never the next action (not re-asked)", () => {
    const s: WorkCardSignals = {
      ...EMPTY,
      hasProfession: true,
      skillsCount: 2,
    };
    const d = deriveWorkCardState(s, NOW);
    expect(d.next.dim).not.toBe("work"); // work is saved → next moves on
    expect(d.clear).toContain("work");
  });
});

describe("exactly one next action, in human-path priority", () => {
  it("empty → work first", () => {
    const d = deriveWorkCardState(EMPTY, NOW);
    expect(d.next.dim).toBe("work");
    expect(d.next.href).toBe("/dashboard/profile");
    expect(d.next.whyKey).toBe("why.work");
  });

  it("work done → availability next", () => {
    const s = { ...EMPTY, hasProfession: true, skillsCount: 1 };
    const d = deriveWorkCardState(s, NOW);
    expect(d.next.dim).toBe("availability");
    expect(d.next.href).toBeNull(); // inline edit
    expect(d.next.whyKey).toBe("why.availability");
  });

  it("work+availability done → location next", () => {
    const s = {
      ...EMPTY,
      hasProfession: true,
      skillsCount: 1,
      availabilitySet: true,
    };
    expect(deriveWorkCardState(s, NOW).next.dim).toBe("location");
  });

  it("only pay missing → pay next with the rate why", () => {
    const s: WorkCardSignals = {
      ...FULL,
      paySet: false,
    };
    const d = deriveWorkCardState(s, NOW);
    expect(d.next.dim).toBe("pay");
    expect(d.next.whyKey).toBe("why.pay");
  });

  it("only evidence missing → journal with the 'later' why", () => {
    const s: WorkCardSignals = {
      ...FULL,
      evidenceCount: 0,
    };
    const d = deriveWorkCardState(s, NOW);
    expect(d.next.dim).toBe("evidence");
    expect(d.next.href).toBe("/dashboard/journal");
    expect(d.next.whyKey).toBe("why.evidence");
  });

  it("fully complete → keep record growing (journal), single action", () => {
    const d = deriveWorkCardState(FULL, NOW);
    expect(d.missing).toEqual([]);
    expect(d.next.href).toBe("/dashboard/journal");
    expect(d.next.whyKey).toBe("why.complete");
  });

  it("every why key maps to one of the four benefit lines (+ complete)", () => {
    const seen = new Set<string>();
    const variants: WorkCardSignals[] = [
      EMPTY,
      { ...EMPTY, hasProfession: true, skillsCount: 1 },
      { ...EMPTY, hasProfession: true, skillsCount: 1, availabilitySet: true },
      {
        ...EMPTY,
        hasProfession: true,
        skillsCount: 1,
        availabilitySet: true,
        locationSet: true,
      },
      { ...FULL, evidenceCount: 0 },
      FULL,
    ];
    for (const v of variants) seen.add(deriveWorkCardState(v, NOW).next.whyKey);
    for (const k of seen) {
      expect(k).toMatch(
        /^why\.(work|availability|location|pay|evidence|complete)$/,
      );
    }
  });
});
