import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Production walk 2026-09-28: Gama, working on a need Alfa SHARED with it,
 * saw Alfa-owner controls on every candidate — contact, booking, contact
 * details, shortlist — which the server correctly refuses. The page now asks
 * whose need it is (`actsForClient`: not one of the caller's own needs) and,
 * for an agency, shows only its real next step: presenting a candidate from
 * its own roster. Server authorization is unchanged and stays canonical.
 */
const PAGE = readFileSync(
  join(__dirname, "..", "..", "app", "[locale]", "dashboard", "company", "scouting", "page.tsx"),
  "utf8",
);

describe("an agency on a client's shared need sees only what it may do", () => {
  it("derives the actor's relation from the caller's own needs", () => {
    expect(PAGE).toMatch(
      /const actsForClient =\s+result\?\.kind === "ok" && !demands\.some\(\(d\) => d\.id === result\.demand\.id\);/,
    );
  });

  it("owner-only controls are behind !actsForClient; the agency gets its present-candidate step", () => {
    const comms = PAGE.slice(PAGE.indexOf("{actsForClient ? ("), PAGE.indexOf("data-testid={`scout-comms-"));
    expect(comms).toMatch(/scout-agency-present-/);
    expect(comms).toMatch(/\/dashboard\/company\/partners/);
    expect(PAGE).toMatch(/\{!actsForClient && result\.interestByWorker\[c\.workerId\] \? \(/);
    expect(PAGE).toMatch(/\{actsForClient \? null : \(\s+<>\s+\{needOpen \? \(\s+<ScoutingShortlistButtons/);
    expect(PAGE).toMatch(/\{actsForClient \? null : \(\s+<Link\s+href=\{nextAction\.href\}/);
  });
});
