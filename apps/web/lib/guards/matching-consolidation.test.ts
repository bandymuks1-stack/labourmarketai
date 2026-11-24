import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  matchWorkerToNeed,
  compareMatches,
  matchStrengthOrder,
  type MatchNeed,
  type MatchSubject,
} from "@/lib/market/match-v1";

/**
 * MATCHING CONSOLIDATION PROOF PACK (Wagon 4; integration control addendum
 * item 2). The admin workbench's duplicate shortlist engine
 * `lib/admin/match-suggestions.ts` (buildMatchSuggestions) was REMOVED and
 * the workbench now runs the ONE canonical engine (lib/market/match-v1).
 * This file carries the required deletion evidence:
 *
 * (a) CALLER INVENTORY (verified 2026-07-16, `grep -rln "match-suggestions"`):
 *     - app/[locale]/dashboard/admin/matching/page.tsx  (rewritten onto
 *       matchWorkerToNeed; ordering via the shared compareMatches)
 *     - lib/guards/matching-workbench.test.ts           (guard updated)
 *     No other importer existed. The unrelated `filterSupply` helper the
 *     module also carried moved verbatim to lib/admin/supply-filter.ts
 *     (compatibility for the only consumer, the same page).
 *
 * (b)+(c) OLD-vs-NEW COMPARISON — the legacy algorithm is FROZEN below as a
 *     fixture and both engines run on the same inputs. Documented
 *     behavioural differences (each asserted):
 *       D1. Legacy shortlisted on free-text TOKEN overlap between the demand
 *           text and profession slugs; canonical matches on the canonical
 *           skill-slug requirement set (display text never matches).
 *       D2. Legacy let filter-signals (country/availability/tokens) rank a
 *           worker who fails a HARD requirement; canonical caps every hard
 *           failure at weak/ineligible BEFORE ordering.
 *       D3. Legacy had no missing-data concept (an unstated fact simply
 *           produced no reason); canonical reports explicit missingFacts and
 *           never converts absence into an outcome.
 *       D4. Legacy exposed evidence as bare counts; canonical exposes
 *           per-criterion tiers with table/field sources (traceable, §19).
 *
 * (d) MANDATORY CRITERIA CANNOT BE WEAKENED — asserted: a worker the legacy
 *     shortlist ranked FIRST is ineligible+weak in the canonical engine when
 *     a hard criterion fails, and orders BELOW an eligible candidate.
 *
 * (e) MISSING DATA IS NEVER A MATCH — asserted on both engines' shared
 *     fixtures: unstated facts yield missingFacts, never "met".
 *
 * (f) ROLLBACK PATH — single-file revert: `git checkout <pre-wagon4-sha> --
 *     apps/web/lib/admin/match-suggestions.ts` (the module was pure and
 *     self-contained; no schema, no data). Then restore the two callers from
 *     the same commit. No migration is involved anywhere in Wagon 4.
 *
 * (g) COMPATIBILITY ADAPTER — not required: no external caller expected the
 *     MatchSuggestion shape (inventory above); filterSupply kept 1:1.
 *
 * (h) WORKER vs TEAM COVERAGE — worker matching: lib/market/match-v1.test.ts
 *     + match-priorities.test.ts; team matching: lib/market/match-team-v1.test.ts
 *     (existence pinned below).
 */

const APP = join(__dirname, "..", "..");

// ── The FROZEN legacy algorithm (verbatim logic of the deleted module) ──────

type LegacyDemand = {
  roleOrWorkType: string | null;
  title: string | null;
  needSummary: string | null;
  country: string | null;
};
type LegacyWorker = {
  id: string;
  locationCountry: string | null;
  preferredCountries: readonly string[];
  availabilityStatus: string | null;
  professionSlugs: readonly string[];
  skillsConfirmed: number;
  managerConfirmations: number;
  journalEntries: number;
};
type LegacySuggestion = { worker: LegacyWorker; reasons: string[] };

const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;
const MIN_TOKEN_LEN = 4;

function legacyBuildMatchSuggestions(
  demand: LegacyDemand,
  supply: readonly LegacyWorker[],
  maxResults = 5,
): LegacySuggestion[] {
  const text = [demand.roleOrWorkType, demand.title, demand.needSummary]
    .filter((v): v is string => !!v)
    .join(" ")
    .toLowerCase();
  const tokens = [
    ...new Set(text.split(TOKEN_SPLIT_RE).filter((t) => t.length >= MIN_TOKEN_LEN)),
  ];
  const country = demand.country?.trim().toUpperCase() ?? null;
  const professionTokenMatch = (slugs: readonly string[]): boolean => {
    for (const slug of slugs) {
      for (const w of slug.toLowerCase().split(/[-_]/)) {
        if (w.length < MIN_TOKEN_LEN) continue;
        for (const t of tokens) if (w.startsWith(t) || t.startsWith(w)) return true;
      }
    }
    return false;
  };
  const scored = supply.map((worker) => {
    const reasons: string[] = [];
    if (country && worker.locationCountry?.toUpperCase() === country) {
      reasons.push("country_match");
    } else if (
      country &&
      worker.preferredCountries.some((c) => c.toUpperCase() === country)
    ) {
      reasons.push("preferred_country_match");
    }
    if (worker.availabilityStatus === "available") reasons.push("available_now");
    if (professionTokenMatch(worker.professionSlugs)) reasons.push("profession_token_match");
    if (worker.skillsConfirmed > 0) reasons.push("verified_skills"); // sr6-allow (frozen legacy enum literal, test-only)
    if (worker.managerConfirmations > 0) reasons.push("manager_confirmations");
    if (worker.journalEntries > 0) reasons.push("journal_evidence");
    return { worker, reasons };
  });
  const filterWeight = (s: LegacySuggestion): number =>
    (s.reasons.includes("country_match") ? 2 : 0) +
    (s.reasons.includes("preferred_country_match") ? 1 : 0) +
    (s.reasons.includes("available_now") ? 1 : 0) +
    (s.reasons.includes("profession_token_match") ? 2 : 0);
  return scored
    .filter((s) => s.reasons.length > 0)
    .sort(
      (a, b) =>
        filterWeight(b) - filterWeight(a) ||
        b.worker.skillsConfirmed - a.worker.skillsConfirmed ||
        b.worker.managerConfirmations - a.worker.managerConfirmations ||
        b.worker.journalEntries - a.worker.journalEntries,
    )
    .slice(0, maxResults);
}

// ── Shared fixtures run through BOTH engines ─────────────────────────────────

const demandText: LegacyDemand = {
  roleOrWorkType: "warehouse worker",
  title: "Warehouse crew needed",
  needSummary: "Order picking in our LT warehouse.",
  country: "LT",
};
const canonicalNeed: MatchNeed = {
  skillIds: ["order-picking", "warehouse-operations"],
  needSource: "human_structured",
  country: "LT",
  languages: ["lt"], // hard requirement (both-sides-stated check)
};

/** Worker A: in-country, available, token-matching profession — but FAILS the
 *  hard language requirement and holds NONE of the required skills. */
const legacyA: LegacyWorker = {
  id: "A",
  locationCountry: "LT",
  preferredCountries: [],
  availabilityStatus: "available",
  professionSlugs: ["warehouse_worker"],
  skillsConfirmed: 3,
  managerConfirmations: 2,
  journalEntries: 5,
};
const canonicalA: MatchSubject = {
  skills: [{ uri: "forklift-operation", evidence: "manager_confirmed" }],
  professionSlug: "warehouse_worker",
  country: "LT",
  availabilityStatus: "available",
  languages: ["ru"], // hard fail: need requires lt
};

/** Worker B: abroad-but-mobile, holds BOTH required skills and the language. */
const legacyB: LegacyWorker = {
  id: "B",
  locationCountry: "PL",
  preferredCountries: ["LT"],
  availabilityStatus: null,
  professionSlugs: ["warehouse_worker"],
  skillsConfirmed: 0,
  managerConfirmations: 0,
  journalEntries: 0,
};
const canonicalB: MatchSubject = {
  skills: [
    { uri: "order-picking", evidence: "work_journal" },
    { uri: "warehouse-operations", evidence: "work_journal" },
  ],
  professionSlug: "warehouse_worker",
  country: "PL",
  preferredCountries: ["LT"],
  languages: ["lt"],
  // availability deliberately UNSTATED (missing-data probe, D3/e)
};

describe("(b)/(c) old-vs-new comparison on shared fixtures — differences enumerated", () => {
  const legacy = legacyBuildMatchSuggestions(demandText, [legacyA, legacyB]);
  const matchA = matchWorkerToNeed(canonicalNeed, canonicalA);
  const matchB = matchWorkerToNeed(canonicalNeed, canonicalB);

  it("D1: legacy ranks on text tokens; canonical on the canonical skill set", () => {
    // Legacy: A first — token/filter signals dominate despite zero required skills.
    expect(legacy[0]?.worker.id).toBe("A");
    expect(legacy[0]?.reasons).toContain("profession_token_match");
    // Canonical: A holds 0 of the required canonical skills — visible as fact.
    expect(matchA.skillFit?.matchedTotal).toBe(0);
    expect(matchB.skillFit?.matchedTotal).toBe(2);
  });

  it("D2/(d): a hard failure cannot be outscored — legacy top pick is ineligible and orders last", () => {
    // Legacy would put A on top of the shortlist…
    expect(legacy[0]?.worker.id).toBe("A");
    // …the canonical engine hard-blocks A (language) BEFORE ordering.
    expect(matchA.blocking.some((b) => b.criterion === "language")).toBe(true);
    expect(matchA.eligible).toBe(false);
    expect(matchA.status).toBe("weak");
    // And the shared comparator orders eligible B strictly above A.
    expect(compareMatches(matchA, matchB)).toBeGreaterThan(0);
    expect(matchStrengthOrder(matchB.status)).toBeGreaterThan(
      matchStrengthOrder(matchA.status),
    );
  });

  it("D3/(e): missing data is an explicit fact, never a match", () => {
    // B's availability is unstated → an honest missing-data note…
    expect(matchB.missingData).toContain("availability_unknown");
    expect(
      matchB.missingFacts.some(
        (f) => f.criterion === "availability" && f.side === "worker",
      ),
    ).toBe(true);
    // …and NO availability outcome exists anywhere (no fabricated "met").
    expect(
      [...matchB.matchedHard, ...matchB.strengths, ...matchB.negotiables].some(
        (c) => c.criterion === "availability",
      ),
    ).toBe(false);
    // Legacy silently produced no reason — absence was indistinguishable
    // from a negative. Canonical distinguishes them (this is the point).
    expect(
      legacyBuildMatchSuggestions(demandText, [legacyB])[0]?.reasons,
    ).not.toContain("available_now");
  });

  it("D4: canonical results carry traceable per-criterion sources", () => {
    for (const c of [...matchB.matchedHard, ...matchB.strengths, ...matchB.blocking]) {
      expect(c.source.length).toBeGreaterThan(0);
    }
  });
});

describe("(a)/(g) the duplicate engine is gone and nothing imports it", () => {
  function walk(dir: string, acc: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
      if (f === "node_modules" || f === ".next") continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, acc);
      else if (/\.(ts|tsx)$/.test(p)) acc.push(p);
    }
    return acc;
  }

  it("lib/admin/match-suggestions.ts no longer exists", () => {
    expect(existsSync(join(APP, "lib", "admin", "match-suggestions.ts"))).toBe(false);
  });

  it("no source file imports the deleted module (caller inventory stays empty)", () => {
    const files = [
      ...walk(join(APP, "app")),
      ...walk(join(APP, "components")),
      ...walk(join(APP, "lib")),
    ].filter((p) => !p.endsWith("matching-consolidation.test.ts"));
    for (const p of files) {
      // Import specifiers only — historical mentions in comments are fine.
      expect(
        /from\s+["'][^"']*admin\/match-suggestions["']/.test(readFileSync(p, "utf8")),
        `${p} still imports the deleted duplicate engine`,
      ).toBe(false);
    }
  });

  it("the workbench page runs the canonical engine with the shared comparator", () => {
    const page = readFileSync(
      join(APP, "app", "[locale]", "dashboard", "admin", "matching", "page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/from "@\/lib\/market\/match-v1"/);
    expect(page).toMatch(/matchWorkerToNeed\(/);
    expect(page).toMatch(/compareMatches\(/);
  });
});

describe("(h) worker and team matching are covered by separate suites", () => {
  it("both canonical test suites exist", () => {
    expect(existsSync(join(APP, "lib", "market", "match-v1.test.ts"))).toBe(true);
    expect(existsSync(join(APP, "lib", "market", "match-priorities.test.ts"))).toBe(true);
    expect(existsSync(join(APP, "lib", "market", "match-team-v1.test.ts"))).toBe(true);
  });
});
