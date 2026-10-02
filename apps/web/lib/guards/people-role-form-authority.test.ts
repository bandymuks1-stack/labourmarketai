import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { projectOrganizationAuthority } from "@/lib/company/organization-authority";

/**
 * A MANAGER IS NOT OFFERED THE OPERATIONAL-ROLE FORM (production walk
 * 2026-10-02, QA manager in Alfa: the form rendered, "Išsaugoti rolę" answered
 * a generic "Nepavyko išsaugoti."). Role assignment is owner/admin in the
 * database; the page must offer it to exactly the people it will accept.
 */
const PAGE = readFileSync(
  join(__dirname, "..", "..", "app", "[locale]", "dashboard", "company", "people", "page.tsx"),
  "utf8",
);

describe("people page: operational roles are offered only to who may assign them", () => {
  it("the page derives canAssignRoles from governance, never a constant", () => {
    expect(PAGE).toMatch(/const canAssignRoles = orgAuthority\?\.canGovern === true;/);
    expect(PAGE).toMatch(/canAssignRoles=\{canAssignRoles\}/);
    expect(PAGE).not.toMatch(/^\s*canAssignRoles\s*$/m);
  });

  it("the authority it reads: owner/admin/creator govern, a manager does not", () => {
    expect(projectOrganizationAuthority({ role: "owner" }).canGovern).toBe(true);
    expect(projectOrganizationAuthority({ role: "admin" }).canGovern).toBe(true);
    expect(projectOrganizationAuthority({ role: "manager" }).canGovern).toBe(false);
    expect(projectOrganizationAuthority({ role: "manager", isCreator: true }).canGovern).toBe(true);
  });
});
