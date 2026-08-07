import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 3 guard — profile completion status reads REAL saved state.
 *
 * The standalone profile/CV clarity card was removed as an orphan
 * (canonical-user-journey v1) — ProfileHubOverview is the one consolidated
 * status surface. This guard keeps the profile page honest: no competing
 * clarity panel, and journal counts read back from the real table.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("Guard: profile completion status is consolidated into the hub", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("the standalone clarity card is no longer a competing panel on the page", () => {
    // Consolidated (P0 profile rescue → canonical-user-journey v1): the single
    // ProfileHubOverview shows CV/skills/journal status (incl. what's missing);
    // the orphaned ProfileCvClarityCard component was deleted. See
    // journal-profile-single-path.test.ts.
    expect(page).not.toMatch(/<ProfileCvClarityCard\b/);
  });

  it("counts journal entries from the real table (read-back, not invented)", () => {
    // W7-S1: the PAGE's own `journal_entries` count was removed — it was a
    // second read of exactly the rows the canonical player card already counts,
    // and its only consumer was the hub's journal pillar. The rule this guard
    // protects (the number is read back from the real table, never invented) is
    // unchanged; it is now enforced where the count actually lives.
    const card = readFileSync(
      join(APP, "lib", "player-card", "player-card.ts"),
      "utf8",
    );
    expect(card).toMatch(/from\(["']journal_entries["']\)/);
    expect(card).toMatch(/count: ["']exact["']/);
    // …and the hub renders THAT count, not one of its own.
    const hub = read("components/app/profile-hub-overview.tsx");
    expect(hub).toMatch(/playerCard\.evidenceEntries/);
    expect(hub).not.toMatch(/from\(["']journal_entries["']\)/);
  });
});
