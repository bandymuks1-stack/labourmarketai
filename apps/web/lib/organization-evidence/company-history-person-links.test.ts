import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * COMPANY HISTORY → THE PERSON (#3354 d). The company side links a historical
 * roster row to the person's own page only when the PERSON confirmed the link
 * (integrity doors v1), on every surface, and never links to a card that does
 * not belong to this organization.
 */
const web = process.cwd();
const read = (p: string) => readFileSync(join(web, p), "utf8");

describe("one rule for opening the person's own page", () => {
  it("the company history uses the person's own confirmation", () => {
    expect(read("lib/organization-evidence/company-work-history-read.ts")).toMatch(
      /p\.link_state === "linked" && p\.link_method === "worker_confirmed" && p\.linked_worker_id/,
    );
  });

  it("the person card uses the same rule (a manager's link or an invitation alone is not enough)", () => {
    const src = read("lib/organization-evidence/company-person-read.ts");
    expect(src).toContain('.select("id, display_name, relationship_kind, link_state, link_method, linked_worker_id")');
    expect(src).toMatch(/linkState === "linked" && row\.data\.link_method === "worker_confirmed"/);
  });
});

describe("no link to a card this organization does not hold", () => {
  const ui = read("components/app/organization/company-work-history.tsx");

  it("the history load names this organization's own roster rows", () => {
    expect(read("lib/organization-evidence/company-work-history-read.ts")).toMatch(/ownPeople\[p\.id\] = true;/);
  });

  it("a person from another organization's roster is shown by name, not linked", () => {
    const block = ui.slice(ui.indexOf("const wid = load.linkedWorkers[pp.id];"), ui.indexOf("company-place-timeline"));
    expect(block).toMatch(/load\.ownPeople\[pp\.id\] \? \(/);
    expect(block).toContain('data-testid="company-place-person-other-roster"');
  });
});
