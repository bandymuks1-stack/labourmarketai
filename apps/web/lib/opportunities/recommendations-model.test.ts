import { describe, expect, it } from "vitest";

import { MATCH_CALC_VERSION, type MatchResultV1 } from "@/lib/market/match-v1";
import type { FitBasis } from "@/lib/market/fit";
import {
  NEAR_MISS_MAX_MISSING_SKILLS,
  NEW_WINDOW_DAYS,
  countUnseenRecommendations,
  deriveJobRecommendations,
  isRecommendable,
  journalConnections,
  salaryOutcome,
  type RecommendationSource,
  type SeenState,
} from "./recommendations-model";

/**
 * Job Recommendation model unit tests: eligibility filter, near-miss
 * inclusion, sort stability, isNew derivation, seen-based dedup counting,
 * salary outcome mapping and the deterministic journal↔job connection.
 * Pure fixtures over the canonical MatchResultV1 shape — no DB.
 */

const fit = (over: Partial<FitBasis> = {}): FitBasis => ({
  pct: 80,
  needTotal: 5,
  matchedTotal: 4,
  matchedConfirmed: 2,
  matchedUris: ["a", "b", "c", "d"],
  matchedConfirmedUris: ["a", "b"],
  missingUris: ["e"],
  ...over,
});

const makeMatch = (over: Partial<MatchResultV1> = {}): MatchResultV1 => ({
  status: "possible",
  skillFit: fit(),
  evidence: {
    matchedManagerConfirmed: 2,
    matchedJournalSupported: 1,
    matchedSelfDeclared: 1,
  },
  evidenceConfidence: "mixed",
  reasons: [{ code: "skill_fit", matched: 4, total: 5, confirmed: 2 }],
  gaps: [],
  missingData: [],
  availability: "available",
  nextAction: "review_and_shortlist",
  calcVersion: MATCH_CALC_VERSION,
  eligible: true,
  matchedHard: [],
  blocking: [],
  strengths: [],
  negotiables: [],
  missingFacts: [],
  ...over,
});

const source = (
  id: string,
  match: MatchResultV1,
  createdAt: string | null = null,
): RecommendationSource => ({
  need: {
    id,
    roleText: "tiler",
    country: "NL",
    locationLabel: null,
    startPeriod: "urgent",
    companyName: null,
    createdAt,
  },
  match,
});

const NO_SEEN_STORE: SeenState = { available: false, seenIds: new Set() };
const seenStore = (...ids: string[]): SeenState => ({
  available: true,
  seenIds: new Set(ids),
});

const NOW = Date.parse("2026-07-14T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

describe("eligibility filter (quality first — no spam)", () => {
  it("an ineligible match (failed hard criterion) is NEVER recommended", () => {
    expect(isRecommendable(makeMatch({ eligible: false }))).toBe(false);
    // Even at perfect coverage.
    expect(
      isRecommendable(
        makeMatch({
          eligible: false,
          status: "weak",
          skillFit: fit({ pct: 100, matchedTotal: 5, missingUris: [] }),
        }),
      ),
    ).toBe(false);
  });

  it("an unstructured need (no skillFit) is never recommended", () => {
    expect(
      isRecommendable(
        makeMatch({ status: "insufficient_data", skillFit: null }),
      ),
    ).toBe(false);
  });

  it("zero matched skills is never recommended", () => {
    expect(
      isRecommendable(
        makeMatch({
          status: "weak",
          skillFit: fit({ matchedTotal: 0, matchedUris: [], pct: 0 }),
        }),
      ),
    ).toBe(false);
  });

  it("strong and possible bands are recommendable", () => {
    expect(isRecommendable(makeMatch({ status: "strong" }))).toBe(true);
    expect(isRecommendable(makeMatch({ status: "possible" }))).toBe(true);
  });
});

describe("near-miss inclusion (missing ≤ 2 skills)", () => {
  it(`a weak-band match with ≤ ${NEAR_MISS_MAX_MISSING_SKILLS} missing skills is included`, () => {
    const nearMiss = makeMatch({
      status: "weak",
      skillFit: fit({
        pct: 60,
        needTotal: 5,
        matchedTotal: 3,
        matchedUris: ["a", "b", "c"],
        missingUris: ["d", "e"],
      }),
    });
    expect(isRecommendable(nearMiss)).toBe(true);
  });

  it("a weak-band match missing 3+ skills is excluded", () => {
    const farMiss = makeMatch({
      status: "weak",
      skillFit: fit({
        pct: 25,
        needTotal: 8,
        matchedTotal: 2,
        matchedUris: ["a", "b"],
        missingUris: ["c", "d", "e"],
      }),
    });
    expect(isRecommendable(farMiss)).toBe(false);
  });
});

describe("ordering (shared §19 comparator) + sort stability", () => {
  it("stronger matches come first", () => {
    const weak = source("weak-1", makeMatch({ status: "possible", skillFit: fit({ pct: 60, matchedTotal: 3 }) }));
    const strong = source("strong-1", makeMatch({ status: "strong" }));
    const recs = deriveJobRecommendations([weak, strong], NO_SEEN_STORE, NOW);
    expect(recs.map((r) => r.requestId)).toEqual(["strong-1", "weak-1"]);
  });

  it("equal-ranking sources keep their input order (stable)", () => {
    const a = source("first", makeMatch());
    const b = source("second", makeMatch());
    const c = source("third", makeMatch());
    const recs = deriveJobRecommendations([a, b, c], NO_SEEN_STORE, NOW);
    expect(recs.map((r) => r.requestId)).toEqual(["first", "second", "third"]);
  });

  it("same inputs → same output (deterministic)", () => {
    const sources = [
      source("x", makeMatch({ status: "strong" })),
      source("y", makeMatch()),
    ];
    expect(deriveJobRecommendations(sources, NO_SEEN_STORE, NOW)).toEqual(
      deriveJobRecommendations(sources, NO_SEEN_STORE, NOW),
    );
  });
});

describe("§19 basis travels whole on every recommendation", () => {
  it("basis carries matched/total/confirmed counts with the pct", () => {
    const [rec] = deriveJobRecommendations(
      [source("r1", makeMatch())],
      NO_SEEN_STORE,
      NOW,
    );
    expect(rec.basis).toEqual({
      pct: 80,
      matchedTotal: 4,
      needTotal: 5,
      matchedConfirmed: 2,
    });
    expect(rec.missingSkillSlugs).toEqual(["e"]);
    expect(rec.matchedSkillSlugs).toEqual(["a", "b", "c", "d"]);
  });
});

describe("isNew flag (7-day window OR unseen)", () => {
  it("created within the window → new, even when already seen", () => {
    const [rec] = deriveJobRecommendations(
      [source("r1", makeMatch(), daysAgo(2))],
      seenStore("r1"),
      NOW,
    );
    expect(rec.isNew).toBe(true);
    expect(rec.unseen).toBe(false);
  });

  it("older than the window but unseen → new", () => {
    const [rec] = deriveJobRecommendations(
      [source("r1", makeMatch(), daysAgo(NEW_WINDOW_DAYS + 5))],
      seenStore(),
      NOW,
    );
    expect(rec.isNew).toBe(true);
    expect(rec.unseen).toBe(true);
  });

  it("old + seen → not new", () => {
    const [rec] = deriveJobRecommendations(
      [source("r1", makeMatch(), daysAgo(NEW_WINDOW_DAYS + 5))],
      seenStore("r1"),
      NOW,
    );
    expect(rec.isNew).toBe(false);
  });

  it("seen store absent → falls back to the created window only (honest)", () => {
    const recs = deriveJobRecommendations(
      [
        source("recent", makeMatch(), daysAgo(1)),
        source("old", makeMatch(), daysAgo(30)),
      ],
      NO_SEEN_STORE,
      NOW,
    );
    const byId = new Map(recs.map((r) => [r.requestId, r]));
    expect(byId.get("recent")!.isNew).toBe(true);
    expect(byId.get("old")!.isNew).toBe(false);
    // Unseen-ness is unknowable without the store — never claimed.
    expect(recs.every((r) => r.unseen === false)).toBe(true);
  });
});

describe("seen-tracking dedup → aggregate notification count", () => {
  it("counts ONLY unseen recommendations", () => {
    const recs = deriveJobRecommendations(
      [
        source("a", makeMatch(), daysAgo(1)),
        source("b", makeMatch(), daysAgo(1)),
        source("c", makeMatch(), daysAgo(1)),
      ],
      seenStore("a"),
      NOW,
    );
    expect(countUnseenRecommendations(recs)).toBe(2);
  });

  it("is 0 while the seen store is absent (a badge that cannot clear is noise)", () => {
    const recs = deriveJobRecommendations(
      [source("a", makeMatch(), daysAgo(1))],
      NO_SEEN_STORE,
      NOW,
    );
    expect(countUnseenRecommendations(recs)).toBe(0);
  });

  it("is 0 once everything shown was seen (visiting IS the read event)", () => {
    const recs = deriveJobRecommendations(
      [source("a", makeMatch()), source("b", makeMatch())],
      seenStore("a", "b"),
      NOW,
    );
    expect(countUnseenRecommendations(recs)).toBe(0);
  });
});

describe("salary comparison outcome (engine result, never recomputed)", () => {
  it("legacy pay_within_offer reason → within", () => {
    const m = makeMatch({
      reasons: [
        { code: "skill_fit", matched: 4, total: 5, confirmed: 2 },
        { code: "pay_within_offer" },
      ],
    });
    expect(salaryOutcome(m)).toBe("within");
  });

  it("structured_v2 compensation met (hard tier) → within", () => {
    const m = makeMatch({
      matchedHard: [
        {
          criterion: "compensation",
          class: "hard",
          outcome: "met",
          source: "customer_requests.payload.structured_v2.compensation",
        },
      ],
    });
    expect(salaryOutcome(m)).toBe("within");
  });

  it("negotiable compensation gap → negotiable", () => {
    const m = makeMatch({
      negotiables: [
        {
          criterion: "compensation",
          class: "negotiable",
          outcome: "negotiable",
          source: "customer_requests.payload.structured_v2.compensation",
        },
      ],
    });
    expect(salaryOutcome(m)).toBe("negotiable");
  });

  it("nothing stated → unknown (never fabricated)", () => {
    expect(salaryOutcome(makeMatch())).toBe("unknown");
  });
});

describe("journal↔job connection (deterministic, from journal_entry_skills)", () => {
  it("intersects recent journal skills with the matched set first", () => {
    const [rec] = deriveJobRecommendations(
      [source("r1", makeMatch())],
      NO_SEEN_STORE,
      NOW,
    );
    const conns = journalConnections(rec, new Set(["b", "e", "zzz"]));
    expect(conns).toEqual([
      { slug: "b", kind: "matched" },
      { slug: "e", kind: "missing" },
    ]);
  });

  it("no overlap → no connection (honest empty, block renders nothing)", () => {
    const [rec] = deriveJobRecommendations(
      [source("r1", makeMatch())],
      NO_SEEN_STORE,
      NOW,
    );
    expect(journalConnections(rec, new Set(["unrelated"]))).toEqual([]);
  });
});
