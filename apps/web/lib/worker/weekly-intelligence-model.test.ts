/**
 * Weekly personal intelligence — pure deriver tests (value train 2, B1).
 *
 * The honesty rules are the test subjects: no fabricated counts, unknowables
 * omitted rather than rendered as zero, every match count carrying its §19
 * basis exemplar, factual (never loss-claim) inactivity coding, and the one
 * weekly idempotency key every consumer must agree on.
 */
import { describe, expect, it } from "vitest";
import type { JobRecommendation } from "../opportunities/recommendations-model";
import {
  WEEKLY_TOP_MISSING_SKILLS_MAX,
  deriveWeeklyPersonalIntelligence,
  isoWeekKey,
  topMissingEvidenceSlugs,
  weeklyDigestDedupeKey,
  type WeeklyJournalFacts,
  type WeeklyOpportunityFacts,
} from "./weekly-intelligence-model";

const WINDOW = { key: "week" as const, startIso: "2026-08-17", endIso: "2026-08-23" };

function journalFacts(over: Partial<WeeklyJournalFacts> = {}): WeeklyJournalFacts {
  return {
    window: WINDOW,
    available: true,
    entryCount: 0,
    confirmedCount: 0,
    lastEntryAtIso: null,
    ...over,
  };
}

function oppFacts(over: Partial<WeeklyOpportunityFacts> = {}): WeeklyOpportunityFacts {
  return {
    available: true,
    totalRecommendable: 0,
    seenAvailable: false,
    newCount: 0,
    appearedThisWeekCount: 0,
    boardTruncated: false,
    top: [],
    ...over,
  };
}

function rec(over: Partial<JobRecommendation> = {}): JobRecommendation {
  return {
    requestId: "req-1",
    roleSlug: "welder",
    country: "LT",
    locationLabel: null,
    startPeriod: null,
    companyName: null,
    opportunityType: null,
    status: "possible",
    basis: { pct: 80, matchedTotal: 16, needTotal: 20, matchedConfirmed: 9 },
    topReasonCodes: [],
    salary: "unknown",
    matchedSkillSlugs: ["welding-mig"],
    missingSkillSlugs: [],
    unseen: false,
    isNew: false,
    recentlyCreated: false,
    ...over,
  };
}

describe("isoWeekKey / weeklyDigestDedupeKey", () => {
  it("computes the ISO-8601 UTC week", () => {
    expect(isoWeekKey("2026-08-23")).toBe("2026-W34"); // a Sunday
    expect(isoWeekKey("2026-08-17")).toBe("2026-W34"); // its Monday
    expect(isoWeekKey("2026-08-24")).toBe("2026-W35"); // next Monday
  });

  it("assigns year-boundary days to the Thursday's ISO year", () => {
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01"); // Mon of the week holding Thu 2026-01-01
    expect(isoWeekKey("2026-01-04")).toBe("2026-W01");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
  });

  it("derives the one weekly idempotency key from the window end", () => {
    expect(weeklyDigestDedupeKey("2026-08-23")).toBe("weekly_digest:2026-W34");
  });
});

describe("topMissingEvidenceSlugs", () => {
  it("dedupes across recommendations, keeps basis order, caps", () => {
    const top = [
      rec({ missingSkillSlugs: ["a", "b"] }),
      rec({ requestId: "req-2", missingSkillSlugs: ["b", "c", "d"] }),
    ];
    expect(topMissingEvidenceSlugs(top)).toEqual(["a", "b", "c"]);
    expect(topMissingEvidenceSlugs(top).length).toBeLessThanOrEqual(
      WEEKLY_TOP_MISSING_SKILLS_MAX,
    );
  });
});

describe("deriveWeeklyPersonalIntelligence — honesty rules", () => {
  it("codes inactivity as a fact, never as a loss claim", () => {
    const out = deriveWeeklyPersonalIntelligence(journalFacts(), oppFacts());
    expect(out.signals[0]).toEqual({ code: "journal_inactive" });
  });

  it("an active week carries entry + confirmed counts", () => {
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts({ entryCount: 4, confirmedCount: 2 }),
      oppFacts(),
    );
    expect(out.signals[0]).toEqual({
      code: "journal_active",
      entries: 4,
      confirmed: 2,
    });
  });

  it("a failed journal read degrades — it never claims zero entries", () => {
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts({ available: false }),
      oppFacts(),
    );
    expect(out.signals[0]).toEqual({ code: "journal_unavailable" });
    expect(out.signals.some((s) => s.code === "journal_inactive")).toBe(false);
  });

  it("a match count always travels with its §19 basis exemplar", () => {
    const best = rec();
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ totalRecommendable: 7, top: [best] }),
    );
    const signal = out.signals.find((s) => s.code === "matching_opportunities");
    expect(signal).toEqual({
      code: "matching_opportunities",
      count: 7,
      exemplar: {
        requestId: "req-1",
        roleSlug: "welder",
        basis: { pct: 80, matchedTotal: 16, needTotal: 20, matchedConfirmed: 9 },
      },
    });
  });

  it("new_opportunities is OMITTED (not zero) while the seen store is absent", () => {
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      // Defensive: even a positive newCount must not surface without the store.
      oppFacts({ totalRecommendable: 3, top: [rec()], seenAvailable: false, newCount: 2 }),
    );
    expect(out.signals.some((s) => s.code === "new_opportunities")).toBe(false);
  });

  it("new_opportunities appears only when the store is applied and positive", () => {
    const withStore = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ totalRecommendable: 3, top: [rec()], seenAvailable: true, newCount: 2 }),
    );
    expect(withStore.signals).toContainEqual({ code: "new_opportunities", count: 2 });

    const zeroNew = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ totalRecommendable: 3, top: [rec()], seenAvailable: true, newCount: 0 }),
    );
    expect(zeroNew.signals.some((s) => s.code === "new_opportunities")).toBe(false);
  });

  it("missing evidence is context-bound to the current top matches", () => {
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({
        totalRecommendable: 1,
        top: [rec({ missingSkillSlugs: ["scaffolding"] })],
      }),
    );
    expect(out.signals).toContainEqual({
      code: "missing_evidence",
      skillSlugs: ["scaffolding"],
    });
  });

  it("an unavailable board yields no market claims at all", () => {
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ available: false, totalRecommendable: 5, top: [rec()] }),
    );
    expect(out.signals).toContainEqual({ code: "opportunities_unavailable" });
    expect(out.signals.some((s) => s.code === "matching_opportunities")).toBe(false);
    expect(out.signals.some((s) => s.code === "missing_evidence")).toBe(false);
  });

  it("zero matches is an honest signal of its own", () => {
    const out = deriveWeeklyPersonalIntelligence(journalFacts(), oppFacts());
    expect(out.signals).toContainEqual({ code: "no_matching_opportunities" });
  });

  it("appeared_this_week is a market fact — present without the seen store", () => {
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({
        totalRecommendable: 3,
        seenAvailable: false,
        appearedThisWeekCount: 2,
        top: [rec()],
      }),
    );
    expect(out.signals).toContainEqual({ code: "appeared_this_week", count: 2 });
    // Still NEVER the seen-based signal without the store.
    expect(out.signals.map((s) => s.code)).not.toContain("new_opportunities");
  });

  it("appeared_this_week is omitted at zero and when the board is unavailable", () => {
    const zero = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ totalRecommendable: 1, appearedThisWeekCount: 0, top: [rec()] }),
    );
    expect(zero.signals.map((s) => s.code)).not.toContain("appeared_this_week");
    const down = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ available: false, appearedThisWeekCount: 5 }),
    );
    expect(down.signals.map((s) => s.code)).not.toContain("appeared_this_week");
  });

  it("journal-backed matches: emitted only for a real, non-empty intersection", () => {
    const top = [rec({ matchedSkillSlugs: ["welding-mig", "forklift"] })];
    const out = deriveWeeklyPersonalIntelligence(
      journalFacts(),
      oppFacts({ totalRecommendable: 1, top }),
      new Set(["welding-mig", "unrelated_skill"]),
    );
    expect(out.signals).toContainEqual({
      code: "journal_backed_matches",
      skillSlugs: ["welding-mig"],
    });
  });

  it("journal-backed matches: omitted when unavailable (null), empty, or board down", () => {
    const top = [rec({ matchedSkillSlugs: ["welding-mig"] })];
    const codes = (s: ReturnType<typeof deriveWeeklyPersonalIntelligence>) =>
      s.signals.map((x) => x.code);
    // null = the skills read is unavailable — omitted, never guessed.
    expect(
      codes(
        deriveWeeklyPersonalIntelligence(
          journalFacts(),
          oppFacts({ totalRecommendable: 1, top }),
          null,
        ),
      ),
    ).not.toContain("journal_backed_matches");
    // Empty intersection — omitted.
    expect(
      codes(
        deriveWeeklyPersonalIntelligence(
          journalFacts(),
          oppFacts({ totalRecommendable: 1, top }),
          new Set(["something_else"]),
        ),
      ),
    ).not.toContain("journal_backed_matches");
    // Unavailable board suppresses ALL market claims, this one included.
    expect(
      codes(
        deriveWeeklyPersonalIntelligence(
          journalFacts(),
          oppFacts({ available: false, top }),
          new Set(["welding-mig"]),
        ),
      ),
    ).not.toContain("journal_backed_matches");
  });

  it("stamps the window and the weekly dedupe key", () => {
    const out = deriveWeeklyPersonalIntelligence(journalFacts(), oppFacts());
    expect(out.window).toEqual(WINDOW);
    expect(out.dedupeKey).toBe("weekly_digest:2026-W34");
  });
});
