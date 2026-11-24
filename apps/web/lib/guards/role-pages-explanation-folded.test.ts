import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner order 2026-11-24 (decisions 0032 and 0034): /for-companies and
 * /for-agencies were four and three screens of explanation. The explanatory
 * part (what the view holds, and the steps) sits behind ONE fold; the FAQ and
 * the action stay on the page. Nothing is removed: a native <details> keeps
 * the text in the document and opens with no script.
 */
const src = readFileSync(
  join(process.cwd(), "components/marketing/role-enrichment.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("role pages — the explanation is behind one fold", () => {
  const start = src.indexOf('data-testid="role-enrichment-more"');
  const end = src.indexOf("</details>");
  const fold = src.slice(start, end);

  it("is a closed native <details> named by the journey headline", () => {
    expect(start).toBeGreaterThan(-1);
    expect(src.slice(start - 200, start)).toContain("<details");
    expect(src.slice(start - 200, start + 60)).not.toMatch(/\sopen[\s>]/);
    expect(fold).toContain('{t("journey.headline")}');
  });

  it("holds the preview points and the steps, both still rendered", () => {
    expect(fold).toContain("bullets.map(");
    expect(fold).toContain("<JourneyTimeline steps={steps} />");
  });

  it("the questions and the action stay outside the fold", () => {
    const after = src.slice(end);
    expect(after).toContain("<FAQAccordion");
    expect(after).toContain("<CtaBand");
  });
});
