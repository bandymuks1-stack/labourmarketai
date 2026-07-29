import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * W5 Slice 1 — LIVE PROFILE CARD guards.
 *
 * The owner's three hard rules for this slice, each turned into a CI check:
 *
 *   1. ONE model — no parallel `LiveProfileCard` domain model may appear
 *      beside the canonical `WorkerPlayerCard`;
 *   2. NO number drift — every profile surface reads that one model rather
 *      than counting rows itself;
 *   3. NO human rating — the §19 forbidden key set may never appear.
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const CARD_MODEL = "lib/player-card/player-card.ts";
const HISTORY_MODEL = "lib/player-card/work-history-model.ts";
const HISTORY_READ = "lib/player-card/work-history.ts";
const SIGNAL = "lib/player-card/opportunity-signal.ts";
const SECTION = "components/app/live-profile-section.tsx";

const LOCALES = ["lt", "en", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"] as const;

/**
 * §19(a) forbids these BY NAME, in any table, API response or UI. The owner
 * restated the list in the W5 ruling; it is duplicated here on purpose so the
 * guard fails even if the doctrine file moves.
 */
const FORBIDDEN_SCORE_KEYS = [
  "opportunityScore",
  "opportunity_score",
  "person_score",
  "personScore",
  "overall_score",
  "overallScore",
  "worker_rating",
  "workerRating",
  "trust_score",
  "trustScore",
  "profile_strength",
  "profileStrength",
  "OVR",
];

describe("W5 — one model, never a parallel one", () => {
  it("no `LiveProfileCard` domain model exists beside the canonical card", () => {
    // A second identity model is the parallel-structure failure the doctrine
    // names: both copies drift, and the honest one loses.
    const libFiles = walk(join(WEB, "lib"));
    const offenders = libFiles.filter((f) => /live-profile-card|liveProfileCard/i.test(f));
    expect(offenders).toEqual([]);
    // The section is a RENDERER; it must not declare a domain interface.
    expect(read(SECTION)).not.toMatch(/export (interface|type) \w*ProfileCard/);
  });

  it("work history is carried BY the canonical card model", () => {
    expect(read(CARD_MODEL)).toMatch(/workHistory: readonly WorkHistoryEntry\[\]/);
    expect(read(CARD_MODEL)).toMatch(/getOwnWorkHistory\(\)/);
  });

  it("the history read is own-data only and never inner-joins the org name", () => {
    const src = read(HISTORY_READ);
    expect(src).toMatch(/\.eq\("profile_id", user\.id\)/);
    // The W4 lesson: an `!inner` join for an OPTIONAL display name deletes the
    // row it was decorating. The organization name is optional here.
    expect(src).not.toMatch(/organizations!inner/);
  });

  it("the pure model computes no ranking and no score", () => {
    // Checked as CODE, not prose: the module's header explains that it scores
    // nothing, so a bare word match would fail on the very statement of the
    // property being asserted.
    const src = read(HISTORY_MODEL);
    expect(src).not.toMatch(/\b(score|rating|weight|rank)\w*\s*[:=]/i);
    expect(src).not.toMatch(/function\s+\w*(score|rank|rate)\w*\s*\(/i);
  });
});

describe("W5 — no number drift", () => {
  it("the section reads the canonical model instead of counting rows", () => {
    const src = read(SECTION);
    expect(src).toMatch(/getWorkerPlayerCard/);
    // No queries, no client, no table names in a presentation component.
    expect(src).not.toMatch(/createClient|\.from\(|\.rpc\(/);
    // …and it does not re-derive readiness either.
    expect(src).toMatch(/deriveWorkerReadiness/);
  });

  it("the opportunity signal reuses the ONE recommendations use case", () => {
    const src = read(SIGNAL);
    expect(src).toMatch(/getWorkerJobRecommendations/);
    expect(src).not.toMatch(/createClient|\.from\(|\.rpc\(|deriveJobRecommendations/);
  });

  it("an unmeasured market is null, never a reassuring zero", () => {
    const src = read(SIGNAL);
    expect(src).toMatch(/matchingCount: number \| null/);
    expect(src).toMatch(/unavailableReason/);
  });
});

describe("W5 — people are never rated (§19)", () => {
  it("no forbidden score key appears in the W5 surface", () => {
    for (const file of [CARD_MODEL, HISTORY_MODEL, HISTORY_READ, SIGNAL, SECTION]) {
      const src = read(file);
      for (const key of FORBIDDEN_SCORE_KEYS) {
        // Matched as an identifier/field, so prose explaining the ban (which
        // these files carry) cannot trip the guard.
        const asField = new RegExp(`(^|[^\\w"'\`])${key}\\s*[:=]`, "m");
        expect(asField.test(src), `${file} defines ${key}`).toBe(false);
      }
    }
  });

  it("defers the repo-wide rule to the canonical guard instead of duplicating it", () => {
    // `fit-not-rating.test.ts` already enforces §19 across the codebase. A
    // second repo-wide scan here would be exactly the duplicated logic this
    // slice is supposed to avoid — and the two copies would drift.
    const canonical = read("lib/guards/fit-not-rating.test.ts");
    for (const key of ["trust_score", "profile_strength", "overall_score", "person_score"]) {
      expect(canonical, `the canonical guard must cover ${key}`).toContain(key);
    }
  });

  it("no W5 code reads the dormant legacy `trust_score` column", () => {
    // The column exists on an organization row in the generated DB types
    // (legacy, pre-existing, and a §19 problem of its own — reported to the
    // owner, not fixed here). What W5 must guarantee is that it stays dormant:
    // nothing in this slice reads or renders it.
    for (const file of [CARD_MODEL, HISTORY_MODEL, HISTORY_READ, SIGNAL, SECTION]) {
      expect(read(file)).not.toMatch(/\btrust_score\s*[:=.]/);
    }
  });

  it("completeness is a NAMED list, never a percentage", () => {
    const src = read(SECTION);
    expect(src).toMatch(/missingReadinessPillars/);
    // Checked on CODE with comments stripped: the section documents that it
    // renders no percentage, and that sentence must not fail its own rule.
    const code = stripComments(src);
    expect(code).not.toMatch(/toFixed\(/);
    expect(code).not.toMatch(/style:\s*["']percent["']/);
    expect(code).not.toMatch(/%/);
  });
});

describe("W5 — copy exists in every active locale", () => {
  it("playerCard.live is complete", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        playerCard?: { live?: Record<string, string> };
      };
      const live = json.playerCard?.live;
      expect(live, `${locale}: playerCard.live missing`).toBeTruthy();
      for (const key of [
        "missingTitle",
        "historyTitle",
        "historyEmpty",
        "evidenceLine",
        "opportunityCount",
        "closestBasis",
        "opportunityUnavailable",
      ]) {
        expect(String(live?.[key] ?? ""), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("every readiness pillar the section can render HAS a label", () => {
    // The section renders one label per MISSING pillar. A pillar with no label
    // resolves to the raw key on screen — next-intl does not throw, so this is
    // exactly the class of defect that ships silently. (It did: the first draft
    // read `readinessSteps.<pillar>` instead of `readinessSteps.action.<pillar>`
    // and leaked `workCard` to the user.)
    const pillars = read("lib/player-card/readiness.ts")
      .match(/export type ReadinessPillarKey =([\s\S]*?);/)?.[1]
      ?.match(/"([a-zA-Z]+)"/g)
      ?.map((s) => s.replace(/"/g, "")) ?? [];
    expect(pillars.length).toBeGreaterThan(0);

    const subtree = read(SECTION).match(/getTranslations\("(playerCard\.readinessSteps[^"]*)"\)/)?.[1];
    expect(subtree, "the section must name its label subtree").toBeTruthy();
    const path = (subtree as string).split(".");

    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<string, unknown>;
      const node = path.reduce<unknown>(
        (o, k) => (o as Record<string, unknown> | undefined)?.[k],
        json,
      ) as Record<string, string> | undefined;
      expect(node, `${locale}: ${subtree} missing`).toBeTruthy();
      for (const pillar of pillars) {
        expect(String(node?.[pillar] ?? ""), `${locale}: ${subtree}.${pillar}`).not.toBe("");
      }
    }
  });

  it("the closest-match line always carries its basis counts", () => {
    // §19(b): a match statement without its counts does not exist.
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        playerCard: { live: Record<string, string> };
      };
      const line = json.playerCard.live.closestBasis;
      for (const token of ["{matched}", "{required}", "{confirmed}"]) {
        expect(line, `${locale}: closestBasis lacks ${token}`).toContain(token);
      }
    }
  });
});

/** Source with block, line and JSX comments removed — so a guard asserts what
 *  the code DOES, never what its documentation says about itself. */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // {/* JSX comment */}
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
