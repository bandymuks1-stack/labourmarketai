import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_NAV_IDS, getCoreNavItems } from "@/lib/config/navigation";
import { actingRoleForWorkspace } from "@/lib/company/organization-switch";
import { ORGANIZATION_WORK_AREAS, organizationHeaderAreas } from "@/lib/navigation/work-areas";

/**
 * NAVIGATION BY ROLE WITHOUT A SECOND CORE (owner P0-2, direction A,
 * 2026-11-03; independent review of #2995).
 *
 * The primary row is the A-03 core loop for everyone. What follows the role is
 * "More" and the phone sheet: for the person whose acting role in the ACTIVE
 * workspace is company or agency (the ONE resolver, `actingRoleForWorkspace`),
 * they open with that organization's own doors, the role's core first.
 */
const header = readFileSync(
  join(__dirname, "../../components/app/conversation/chat/conversation-header.tsx"),
  "utf8",
);
const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

describe("the header follows the acting role, the primary row stays the core loop", () => {
  it("the primary row is exactly the A-03 core loop, for every workspace", () => {
    expect(header).toMatch(/const primary = getCoreNavItems\(\);/);
    expect(ids(getCoreNavItems())).toEqual([...CORE_NAV_IDS]);
  });

  it("the acting role comes from the ONE resolver, with the held roles", () => {
    expect(header).toMatch(/actingRoleForWorkspace\(activeWorkspace, auth\?\.roles \?\? \[\]\)/);
    expect(header).toMatch(
      /const overflow = \[\.\.\.organizationAreas, \.\.\.getHeaderOverflowNavItems\(\{ isAdmin \}\)\]/,
    );
  });

  it("only an owner or manager who HOLDS the role gets the organization's doors", () => {
    const org = { kind: "organization", organizationType: "company", relationship: "owner" } as const;
    expect(actingRoleForWorkspace(org, ["company"])).toBe("company");
    expect(actingRoleForWorkspace(org, ["worker"])).toBeNull();
    expect(actingRoleForWorkspace({ ...org, relationship: "employee" }, ["company", "worker"])).toBe("worker");
    expect(actingRoleForWorkspace({ kind: "personal" }, ["company"])).toBeNull();
    // An agency organization where the person holds only the company role is
    // run as a company — the same answer the home and the assistant use.
    expect(actingRoleForWorkspace({ ...org, organizationType: "agency" }, ["company"])).toBe("company");
    expect(actingRoleForWorkspace({ ...org, organizationType: "agency" }, ["agency"])).toBe("agency");
  });

  it("a company leads with people · projects · hours; an agency with people · clients · projects", () => {
    expect(ids(organizationHeaderAreas("company")).slice(0, 3)).toEqual([
      "area:people",
      "area:projects",
      "area:work",
    ]);
    expect(ids(organizationHeaderAreas("agency")).slice(0, 3)).toEqual([
      "area:people",
      "area:clients",
      "area:projects",
    ]);
  });

  it("every organization door is listed once, and none repeats a core-loop destination", () => {
    const coreHrefs = new Set(getCoreNavItems().map((i) => i.href));
    for (const role of ["company", "agency"] as const) {
      const areas = organizationHeaderAreas(role);
      const hrefs = areas.map((a) => a.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const h of hrefs) expect(coreHrefs.has(h), h).toBe(false);
      for (const a of ORGANIZATION_WORK_AREAS) {
        if (!coreHrefs.has(a.href)) expect(hrefs, a.id).toContain(a.href);
      }
    }
  });
});
