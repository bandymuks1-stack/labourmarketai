import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * COMPRESSED FIRST VIEW GUARD (owner rule 2026-08-29).
 *
 * The opportunities board must never open as a result wall: the default
 * first view is the 3 strongest matches (hard ceiling 5 including the
 * external block's slots), with the ENTIRE ranked universe reachable via
 * ?view=all, filters, and sort. This guard pins the page wiring so a
 * refactor cannot quietly reconnect the full array to the list — or,
 * equally bad, quietly delete the door to the rest of the universe.
 *
 * The pure cap logic itself is tested in
 * lib/opportunities/discovery-filters.test.ts; this file guards the WIRING.
 * Reads are CRLF-normalized so the verdict is identical on Windows and CI.
 */

const read = (p: string): string =>
  readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const page = read("app/[locale]/dashboard/opportunities/page.tsx");
const section = read("components/app/external-vacancies-section.tsx");

describe("opportunities board — compressed first view wiring", () => {
  it("the page derives the first view through selectInitialBoardView", () => {
    expect(page).toContain("selectInitialBoardView(filtered");
  });

  it("the card list renders the compressed view, not the full array", () => {
    expect(page).toContain("initialView.visible.map(");
    // The old wall: the full filtered array feeding the <li> map directly.
    expect(page).not.toMatch(/\{filtered\.map\(\{?\(?\s*\{\s*need/);
  });

  it("the shown-marker records only what actually rendered (read event honesty)", () => {
    expect(page).toContain(
      "requestIds={initialView.visible.map((o) => o.need.id)}",
    );
  });

  it("the withheld remainder has a real door — show-all link with the honest count", () => {
    expect(page).toContain('data-testid="opportunities-show-more"');
    expect(page).toContain('data-testid="opportunities-show-all"');
    expect(page).toContain("?view=all");
  });

  it("a saved bookmark to a hidden card routes through the expanded view, never a dead anchor", () => {
    expect(page).toContain("visibleIds.has(need.id)");
  });

  it("facets keep covering the FULL authorized universe, not the visible slice", () => {
    expect(page).toMatch(
      /collectDiscoveryFacets\(\s*result\.opportunities\.map/,
    );
  });

  it("the external block shares the same 5-item first-view budget", () => {
    expect(page).toContain("initialCount={externalInitialCount}");
    expect(page).toMatch(
      /INITIAL_VIEW_MAX_COUNT - initialView\.visible\.length/,
    );
  });
});

describe("external vacancies section — compression is presentation only", () => {
  it("caps by slicing the already-ranked list, never re-filtering or re-ranking", () => {
    expect(section).toContain("cards.slice(0, initialCount)");
  });

  it("a capped section always renders the expansion door", () => {
    expect(section).toContain(
      'data-testid="opportunities-external-show-all"',
    );
  });

  it("uncapped behavior is untouched — null initialCount renders every loaded ad", () => {
    expect(section).toContain("initialCount = null");
    expect(section).toMatch(
      /initialCount != null && cards\.length > initialCount/,
    );
  });
});
