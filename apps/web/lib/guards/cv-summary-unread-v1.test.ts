import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The CV never prints the word "null", and never a 0 it did not count.
 *
 * `OwnTrustSignals` counts became `number | null` so an unread count stops
 * reading as "you have none" (#1652). That widening reached the CV page, where
 * the three summary figures are rendered TWICE — as boxes, and as an
 * interpolated one-line string in the compact layout.
 *
 * Both paths were wrong for null, in different ways. React renders `null` as
 * an empty box, so the figure silently vanished with no explanation. The
 * compact path interpolated it, which puts the literal text
 * "Journal entries: null" onto the document a person hands to an employer.
 *
 * So the null is resolved ONCE, into `text`, before either renderer sees it.
 */

const PAGE = readFileSync(
  join(process.cwd(), "app/[locale]/cv/page.tsx"),
  "utf8",
);

describe("the CV summary resolves an unread count before rendering it", () => {
  it("maps null to an em dash once, for both layouts", () => {
    expect(PAGE).toMatch(
      /\.map\(\(s\) => \(\{ \.\.\.s, text: s\.value === null \? "—" : String\(s\.value\) \}\)\)/,
    );
  });

  it("an unread count is NOT rendered as 0 — that would be a false claim on a CV", () => {
    expect(PAGE).not.toMatch(/cv\.signals\.\w+ \?\? 0/);
  });

  it("neither renderer touches the raw value", () => {
    // The box layout and the compact one-liner must both read `text`.
    const summaryBlock = PAGE.slice(PAGE.indexOf('data-testid="cv-summary"'));
    expect(summaryBlock).not.toMatch(/\{s\.value\}/);
    expect(summaryBlock).not.toMatch(/\$\{s\.value\}/);
    expect(summaryBlock).toMatch(/\{s\.text\}/);
    expect(summaryBlock).toMatch(/\$\{s\.text\}/);
  });
});
