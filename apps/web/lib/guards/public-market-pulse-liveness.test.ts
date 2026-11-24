import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * MarketPulse honesty guard (owner directive 2026-08-09, beta train §8).
 *
 * The landing MarketPulse panels render GOVERNED PLACEHOLDERS
 * (content/placeholders.ts). A pulsing "live" indicator on top of placeholder
 * data visually claims live market intelligence the platform is not
 * computing — the verified P2 this guard exists to keep fixed.
 *
 * This is the same doctrine the admin pulse board already pins
 * (s8-market-pulse.test.ts: "no decorative liveliness — no pulsing dots
 * pretending activity"), extended to the PUBLIC marketing surface. Like
 * public-no-fabricated-confidence.test.ts, it exists so the landing freeze is
 * not the only thing standing between the landing and the fake-liveness
 * coming back.
 *
 * Scope is exactly the MarketPulse render tree. Copy stays untouched (the
 * frozen `marketPulse` namespaces already say "overview", not "live") and the
 * placeholder registry is not read here at all.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MARKET_PULSE_TREE = [
  "components/marketing/market-pulse.tsx",
  "components/app/regional-heatmap.tsx",
  "components/app/skills-demand-list.tsx",
  "components/app/supply-demand-chart.tsx",
  "components/app/recent-matches-feed.tsx",
] as const;

describe("landing MarketPulse claims no liveness over placeholder data", () => {
  it("no pulsing live indicator anywhere in the MarketPulse tree", () => {
    for (const rel of MARKET_PULSE_TREE) {
      const src = read(rel);
      expect(src, `${rel} renders a live-dot`).not.toMatch(/live-dot/);
      expect(src, `${rel} renders a signal-dot`).not.toMatch(/signal-dot/);
      expect(src, `${rel} uses animate-ping`).not.toMatch(/animate-ping/);
    }
  });

  it("the panels still render from the governed placeholder feed (scope check)", () => {
    // If a panel stops reading placeholders and starts reading REAL data,
    // this guard's premise changes — surface that as a failure so the
    // liveness question is re-decided consciously rather than inherited.
    for (const rel of [
      "components/app/regional-heatmap.tsx",
      "components/app/skills-demand-list.tsx",
      "components/app/supply-demand-chart.tsx",
      "components/app/recent-matches-feed.tsx",
    ]) {
      expect(read(rel), `${rel} placeholder read`).toMatch(
        /content\/placeholders/,
      );
    }
  });
});
