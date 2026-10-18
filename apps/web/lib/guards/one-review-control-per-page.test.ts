import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE human-usable control per action. Production walk 2026-09-28: the
 * company people page carried two "switch on review" controls for the same
 * person — the legacy worker-operations block (old link tables; dead-ends for
 * an ordinary worker until a reviewer role is set) ~2000 px ABOVE the
 * organization members panel, the path proven end to end (worker records →
 * employer inbox → confirmation → manager-confirmed history). When the page
 * has the members panel, the legacy block renders one link to it instead.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
const PAGE = read("app/[locale]/dashboard/company/people/page.tsx");
const SECTION = read("components/app/company-workers-section.tsx");
const FORM = read("components/app/worker-operations-role-form.tsx");

describe("the people page has one journal-review control", () => {
  it("the members panel is an anchor, and the roster points there whenever it renders", () => {
    expect(PAGE).toMatch(/<div id="org-members"[^>]*>\s*<OrgMembersPanel/);
    expect(PAGE).toMatch(
      /reviewElsewhere=\{\s*orgMembers\s*\?\s*\{ href: "#org-members", label: orgMembersLabels\.title \}\s*:\s*undefined\s*\}/,
    );
    expect(SECTION).toMatch(/reviewElsewhere=\{reviewElsewhere\}/);
  });

  it("with reviewElsewhere, the legacy form shows a link instead of its own toggle", () => {
    const branch = FORM.slice(FORM.indexOf("{reviewElsewhere ? ("));
    expect(branch.indexOf("worker-ops-review-elsewhere-")).toBeGreaterThan(-1);
    // the link comes first; the legacy toggle is only the fallback branch
    expect(branch.indexOf("worker-ops-review-elsewhere-")).toBeLessThan(
      branch.indexOf("worker-ops-review-submit-"),
    );
  });
});
