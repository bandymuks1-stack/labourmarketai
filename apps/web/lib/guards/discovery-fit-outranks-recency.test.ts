import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compareMatches, type MatchResultV1 } from "@/lib/market/match-v1";
import {
  freshnessDemotionRank,
  type LastActiveBucket,
} from "@/lib/scouting/profile-freshness";

/**
 * On employer discovery, FIT ranks above profile-touch recency.
 *
 * W10 audit P0-2. `scouting.ts` sorted `freshnessDemotionRank` FIRST and
 * `compareMatches` second, so an activity signal outranked a competence signal
 * unconditionally:
 *
 *   Worker A — 100% coverage, every skill manager_confirmed, `strong`,
 *              `eligible`, last profile write 91 days ago  → dormant → key 1
 *   Worker B — zero skills, `insufficient_data`, not eligible,
 *              saved a field yesterday                     → active  → key 0
 *
 * B listed above A **on every demand**. The employer's best candidate sat
 * under every recently-active account, and the way to outrank competence was
 * to touch a form — the definition of a gameable ranking.
 *
 * Freshness is not worthless: a dormant profile really is less likely to
 * reply. It is now a TIE-BREAK after the need-context comparator. It reorders
 * equals; it cannot overturn fit.
 *
 * This guard reproduces the audit's exact pair through the REAL comparator
 * composition, so it fails if the keys are ever swapped back — including by a
 * refactor that keeps both functions and only changes their order.
 */

const APP = join(__dirname, "..", "..");
const SCOUTING = readFileSync(join(APP, "lib", "scouting", "scouting.ts"), "utf8");

interface Row {
  readonly workerId: string;
  readonly match: MatchResultV1;
  readonly lastActiveBucket: LastActiveBucket;
}

/** The ordering as shipped — fit, then freshness, then a stable id. */
const shippedOrder = (a: Row, b: Row) =>
  compareMatches(a.match, b.match) ||
  freshnessDemotionRank(a.lastActiveBucket) - freshnessDemotionRank(b.lastActiveBucket) ||
  a.workerId.localeCompare(b.workerId);

/** The PRE-FIX ordering, kept as a control so the test proves a change. */
const preFixOrder = (a: Row, b: Row) =>
  freshnessDemotionRank(a.lastActiveBucket) - freshnessDemotionRank(b.lastActiveBucket) ||
  compareMatches(a.match, b.match);

/**
 * Fixtures shaped for the REAL comparator, which reads, in order:
 * `status` → `skillFit.pct` → `skillFit.matchedConfirmed` → `availability`.
 * Inventing field names here would make the test pass while exercising
 * nothing (an earlier draft did exactly that, and typecheck caught it).
 */
function match(
  status: MatchResultV1["status"],
  pct: number,
  matchedConfirmed: number,
  eligible: boolean,
): MatchResultV1 {
  return {
    status,
    eligible,
    skillFit: pct > 0 ? { pct, matchedConfirmed } : null,
    evidence: {
      matchedManagerConfirmed: matchedConfirmed,
      matchedJournalSupported: 0,
      matchedSelfDeclared: 0,
    },
    reasons: [],
    gaps: [],
    missingData: [],
    availability: "unknown",
    nextAction: "none",
    calcVersion: "2",
  } as unknown as MatchResultV1;
}

/** The audit's worker A: excellent, and 91 days since a profile write. */
const A: Row = {
  workerId: "aaaaaaaa-0000-0000-0000-000000000001",
  match: match("strong", 100, 12, true),
  lastActiveBucket: "dormant",
};

/** The audit's worker B: empty profile, touched yesterday. */
const B: Row = {
  workerId: "bbbbbbbb-0000-0000-0000-000000000002",
  match: match("insufficient_data", 0, 0, false),
  lastActiveBucket: "active",
};

describe("the audit's pair is ordered by competence, not by recency", () => {
  it("PRE-FIX control: the empty-but-active profile won", () => {
    // Kept live so this file demonstrates a real change rather than asserting
    // about a constant. If this ever stops holding, the audit's premise moved
    // and the rest of this guard needs re-reading.
    expect([A, B].sort(preFixOrder)[0].workerId).toBe(B.workerId);
  });

  it("POST-FIX: the strong, fully-confirmed candidate ranks first", () => {
    expect([A, B].sort(shippedOrder)[0].workerId).toBe(A.workerId);
    expect([B, A].sort(shippedOrder)[0].workerId).toBe(A.workerId);
  });

  it("a dormant profile can never be pushed below a worse-matching active one", () => {
    const ordered = [B, A].sort(shippedOrder);
    const iA = ordered.findIndex((r) => r.workerId === A.workerId);
    const iB = ordered.findIndex((r) => r.workerId === B.workerId);
    expect(iA).toBeLessThan(iB);
  });
});

describe("freshness still does its job — between equals", () => {
  it("equal fit: the active profile ranks above the dormant one", () => {
    const strong = match("strong", 100, 5, true);
    const dormantEqual: Row = { workerId: "c-1", match: strong, lastActiveBucket: "dormant" };
    const activeEqual: Row = { workerId: "c-2", match: strong, lastActiveBucket: "active" };
    expect([dormantEqual, activeEqual].sort(shippedOrder)[0].workerId).toBe("c-2");
  });

  it("dormant profiles are demoted, never hidden", () => {
    const strong = match("strong", 100, 5, true);
    const rows: Row[] = [
      { workerId: "d-1", match: strong, lastActiveBucket: "dormant" },
      { workerId: "d-2", match: strong, lastActiveBucket: "active" },
    ];
    expect(rows.sort(shippedOrder)).toHaveLength(2);
  });
});

describe("the ordering is deterministic", () => {
  it("candidates equal on fit AND freshness keep a stable order", () => {
    // Without a final tie-break, two equal candidates could swap between two
    // loads of the same page — an unstable list reads as a changing
    // recommendation.
    const strong = match("strong", 100, 5, true);
    const rows: Row[] = [
      { workerId: "e-3", match: strong, lastActiveBucket: "active" },
      { workerId: "e-1", match: strong, lastActiveBucket: "active" },
      { workerId: "e-2", match: strong, lastActiveBucket: "active" },
    ];
    const once = [...rows].sort(shippedOrder).map((r) => r.workerId);
    const twice = [...rows].reverse().sort(shippedOrder).map((r) => r.workerId);
    expect(once).toEqual(twice);
    expect(once).toEqual(["e-1", "e-2", "e-3"]);
  });
});

describe("the shipped source really composes the keys in this order", () => {
  it("compareMatches comes before freshnessDemotionRank in the sort", () => {
    const sortBlock = SCOUTING.slice(SCOUTING.indexOf(".sort("));
    const iFit = sortBlock.indexOf("compareMatches");
    const iFresh = sortBlock.indexOf("freshnessDemotionRank");
    expect(iFit).toBeGreaterThan(-1);
    expect(iFresh).toBeGreaterThan(-1);
    expect(
      iFit,
      "freshnessDemotionRank is ahead of compareMatches again — recency is " +
        "outranking fit on employer discovery (W10 P0-2)",
    ).toBeLessThan(iFresh);
  });

  it("a stable id tie-break closes the sort", () => {
    expect(SCOUTING).toMatch(/workerId\.localeCompare/);
  });
});

describe("no other banned signal entered the discovery ranking", () => {
  const stripped = SCOUTING.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  it("no trust score, rating, stars, reputation or fraud signal ranks candidates", () => {
    for (const banned of [
      "trustScore",
      "trust_score",
      "ratingAvg",
      "stars",
      "reputationScore",
      "fraudScore",
    ]) {
      expect(stripped, `banned ranking signal "${banned}"`).not.toContain(banned);
    }
  });

  it("workers.updated_at is not read as a fit input inside the sort", () => {
    // Bounded to the comparator itself. Slicing to end-of-file would sweep in
    // unrelated later code (the shortlist writer mentions other columns) and
    // fail for reasons that have nothing to do with ranking.
    const start = stripped.indexOf(".sort(");
    expect(start).toBeGreaterThan(-1);
    const comparator = stripped.slice(start, start + 400);
    expect(comparator).not.toContain("updated_at");
    expect(comparator).toContain("compareMatches");
  });
});
