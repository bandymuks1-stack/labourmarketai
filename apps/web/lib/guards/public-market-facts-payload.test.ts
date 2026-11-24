import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MARKET_FACTS_TOP_N,
  MIN_ADS_FOR_EXPLANATION,
  RANKING_WINDOW_ADS,
  buildPublicMarketFacts,
  marketIsExplainable,
  type MarketRankingRow,
} from "@/lib/market/public-market-facts";
import { marketExplanationInputSchema } from "@/lib/ai/registry/agents/market-explanation";
import { sensitivityForTask } from "@/lib/ai/runtime/data-sensitivity";
import { TASK_POLICIES, taskTypeForAgent } from "@/lib/ai/runtime/task-routing";

/**
 * THE PAYLOAD THAT MAY LEAVE THE PLATFORM.
 *
 * `explain_market_demand` is the only task classed `PUBLIC`, and `PUBLIC` is
 * the only class an ungranted external provider may receive. So this one
 * payload is the entire surface area of what labourmarket.ai sends to a third
 * party today, and "it carries no data subject" is a claim that has to stay
 * true through every later edit — including the well-meaning one that adds the
 * advertisement title "because it would read better".
 *
 * Three independent locks, because each catches a different mistake:
 *
 *   1. THE READ. `public-market-facts-read.ts` must not SELECT a forbidden
 *      column. Checked against the source text, since a column that is never
 *      fetched cannot be leaked by any amount of downstream carelessness.
 *   2. THE SCHEMA. The agent's input schema is `.strict()`, so a payload
 *      carrying an extra field is rejected before dispatch rather than
 *      silently trimmed. Asserted by feeding it one.
 *   3. THE CLASSIFICATION. The task stays `PUBLIC` and stays bound to the
 *      agent, so the wiring cannot drift apart from the reasoning.
 */

const SRC = (rel: string) =>
  readFileSync(join(__dirname, "..", ...rel.split("/")), "utf8");

/** Columns on `public_vacancies` that must never be selected by the market
 *  read. Free text, third-party identity, row identity, precise location. */
const FORBIDDEN_COLUMNS = [
  "title_raw",
  "description_raw",
  "translation_title_text",
  "translation_description_text",
  "employer_name",
  "employer_homepage",
  "employer_external_org_id",
  "application_url",
  "external_id",
  "compensation_description",
  "lat",
  "lng",
] as const;

describe("the read never fetches a column the payload must not carry", () => {
  const src = SRC("market/public-market-facts-read.ts");

  /**
   * Every column name this module asks PostgREST for.
   *
   * Matched against the column-list LITERALS rather than the raw file text,
   * because a substring search is the guard failure this repo has been burned
   * by before: "lat" is inside "platform", so a naive `not.toContain` goes red
   * on a comment and teaches the next person to weaken the check. Tokenising
   * the lists tests the thing that actually decides what is fetched.
   *
   * Both spellings are matched: `.select("…")` for a direct query, and `q("…")`
   * for the shared browsable-predicate builder the module actually uses. The
   * negative control below exists because the first version of this regex
   * matched only `.select(` and therefore found NOTHING — a tokeniser that
   * matches nothing passes every assertion under it.
   */
  const selectedColumns = [...src.matchAll(/(?:\.select|\bq)\(\s*"([^"]*)"/g)]
    .map((m) => m[1])
    .filter((v): v is string => typeof v === "string")
    .flatMap((list) => list.split(","))
    .map((c) => c.trim())
    .filter((c) => c !== "");

  it("the detector actually found the select lists", () => {
    // A tokeniser that matched nothing would pass every assertion below.
    expect(selectedColumns.length).toBeGreaterThan(0);
    expect(selectedColumns).toContain("skill_slugs");
  });

  it.each(FORBIDDEN_COLUMNS)("does not select %s", (column) => {
    expect(selectedColumns).not.toContain(column);
  });

  it("selects exactly the four ranking columns and one count column", () => {
    // Pinned as a set so widening it is an explicit edit here too, not just a
    // diff someone skims. `id` is the head-count column — no row is returned
    // for those queries, only a number.
    expect([...new Set(selectedColumns)].sort()).toEqual([
      "city",
      "country",
      "id",
      "published_at",
      "skill_slugs",
    ]);
  });

  it("cannot take the opportunities board down with it", () => {
    // The panel is ADDITIVE on a page real workers use to find work. A
    // rejected promise in a server component takes the whole page with it, so
    // an outage in an optional market section would cost someone their board.
    // Every failure must be a named `unavailable` instead.
    expect(src).toContain("try {");
    expect(src).toContain('reason: "read_threw"');
  });

  it("restates the browsable predicate rather than trusting RLS alone", () => {
    // RLS enforces `is_active` only. An expired-but-active ad is in the policy
    // and out of the board — the exact gap that made a landing-page count
    // false against what a visitor could reach.
    expect(src).toContain("expires_at.is.null,expires_at.gt.");
  });
});

describe("the agent's input schema is the second lock", () => {
  const facts = buildPublicMarketFacts({
    professionSlug: "electrician",
    measuredAtIso: "2026-08-24T00:00:00.000Z",
    counts: { activeAds: 710, newAds7d: 166, newAds30d: 402, adsStatingPay: 0 },
    windowRows: [
      { skill_slugs: ["electrical-install"], city: "Stockholm", country: "SE", published_at: "2026-08-23T00:00:00.000Z" },
    ],
  });

  it("accepts the payload the assembler produces", () => {
    expect(marketExplanationInputSchema.safeParse(facts).success).toBe(true);
  });

  it("REJECTS a payload carrying anything about a person", () => {
    const smuggled = { ...facts, workerName: "A. Person" };
    const parsed = marketExplanationInputSchema.safeParse(smuggled);
    expect(parsed.success).toBe(false);
  });

  it("REJECTS advertisement free text", () => {
    const smuggled = { ...facts, topAdvertisementTitle: "Elektriker sökes" };
    expect(marketExplanationInputSchema.safeParse(smuggled).success).toBe(false);
  });
});

describe("the classification stays bound to the agent", () => {
  it("market_explanation runs the PUBLIC task", () => {
    expect(taskTypeForAgent("market_explanation")).toBe("explain_market_demand");
    expect(sensitivityForTask("explain_market_demand")).toBe("PUBLIC");
  });

  it("the task cannot escalate into a model nobody priced for it", () => {
    const policy = TASK_POLICIES.explain_market_demand;
    expect(policy.preferredTier).toBe("low_cost");
    expect(policy.fallbackTier).toBe("low_cost");
    expect(policy.escalationConditions).toEqual([]);
    expect(policy.maxEstimatedCostUsd).toBeLessThanOrEqual(0.05);
  });
});

describe("the honesty rules the copy depends on", () => {
  const row = (city: string | null): MarketRankingRow => ({
    skill_slugs: ["welding"],
    city,
    country: "SE",
    published_at: "2026-08-23T00:00:00.000Z",
  });

  it("a window shorter than the population is NOT reported as complete", () => {
    const facts = buildPublicMarketFacts({
      professionSlug: "welder",
      measuredAtIso: "2026-08-24T00:00:00.000Z",
      counts: { activeAds: 900, newAds7d: 10, newAds30d: 40, adsStatingPay: 0 },
      windowRows: Array.from({ length: RANKING_WINDOW_ADS }, () => row("Malmö")),
    });
    expect(facts.rankingWindowAds).toBe(RANKING_WINDOW_ADS);
    expect(facts.rankingWindowCoversAll).toBe(false);
  });

  it("a window that held everything IS reported as complete", () => {
    const facts = buildPublicMarketFacts({
      professionSlug: "welder",
      measuredAtIso: "2026-08-24T00:00:00.000Z",
      counts: { activeAds: 3, newAds7d: 1, newAds30d: 3, adsStatingPay: 0 },
      windowRows: [row("Malmö"), row("Malmö"), row("Lund")],
    });
    expect(facts.rankingWindowCoversAll).toBe(true);
  });

  it("an empty market is a result, never completeness", () => {
    const facts = buildPublicMarketFacts({
      professionSlug: "barista",
      measuredAtIso: "2026-08-24T00:00:00.000Z",
      counts: { activeAds: 0, newAds7d: 0, newAds30d: 0, adsStatingPay: 0 },
      windowRows: [],
    });
    expect(facts.activeAds).toBe(0);
    expect(facts.topSkills).toEqual([]);
    // Zero rows is not "the window covered everything" — it is no window at
    // all, and claiming completeness over nothing would let the prompt present
    // an empty ranking as the whole market.
    expect(facts.rankingWindowCoversAll).toBe(false);
    expect(marketIsExplainable(facts)).toBe(false);
  });

  it("a market under the threshold is not sent to a model at all", () => {
    const under = buildPublicMarketFacts({
      professionSlug: "barber",
      measuredAtIso: "2026-08-24T00:00:00.000Z",
      counts: {
        activeAds: MIN_ADS_FOR_EXPLANATION - 1,
        newAds7d: 0,
        newAds30d: 1,
        adsStatingPay: 0,
      },
      windowRows: [row("Uppsala")],
    });
    expect(marketIsExplainable(under)).toBe(false);
  });

  it("nulls and blanks never become a ranked key", () => {
    const facts = buildPublicMarketFacts({
      professionSlug: "cleaner",
      measuredAtIso: "2026-08-24T00:00:00.000Z",
      counts: { activeAds: 4, newAds7d: 0, newAds30d: 4, adsStatingPay: 0 },
      windowRows: [row(null), row("  "), row("Göteborg"), row("Göteborg")],
    });
    expect(facts.topCities).toEqual([{ key: "Göteborg", ads: 2 }]);
  });

  it("rankings are bounded — an explanation is not a data dump", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      skill_slugs: [`skill-${i}`],
      city: `City ${i}`,
      country: "SE",
      published_at: "2026-08-23T00:00:00.000Z",
    }));
    const facts = buildPublicMarketFacts({
      professionSlug: "driver",
      measuredAtIso: "2026-08-24T00:00:00.000Z",
      counts: { activeAds: 40, newAds7d: 5, newAds30d: 20, adsStatingPay: 0 },
      windowRows: many,
    });
    expect(facts.topSkills.length).toBe(MARKET_FACTS_TOP_N);
    expect(facts.topCities.length).toBe(MARKET_FACTS_TOP_N);
  });
});

describe("the AI call site sends the facts and nothing else", () => {
  const src = SRC("market/market-explanation-actions.ts");

  it("does not attribute the run to a person", () => {
    // Every other caller passes `profileId` and is right to: those runs ARE
    // about that person. This one is about an occupation, so recording a
    // subject would record one the run does not have — and would write exactly
    // the person-linked telemetry the D1 de-linking work exists to reduce.
    expect(src).not.toContain("profileId:");
  });

  it("throttles per user before it can spend anything", () => {
    expect(src).toContain("rateLimit(");
    expect(src).toContain("ai-market-explanation");
  });

  it("refuses an anonymous caller", () => {
    // A "use server" action is callable from anywhere, not only from the
    // component that renders the button.
    expect(src).toContain("not_authenticated");
  });
});
