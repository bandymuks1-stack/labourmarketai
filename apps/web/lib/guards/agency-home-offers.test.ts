import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { organizationHeaderAreas } from "@/lib/navigation/work-areas";

/**
 * AN AGENCY OFFERS PEOPLE (SEP-4, owner P0 2026-11-24, agency path walk).
 *
 * A new staffing agency's home led with the employer's "Describe a need", and
 * its header menu named the supply page "What we need" while the page and its
 * door said "Supply". The agency home now leads with "Offer workers" (the
 * offer intake, the same address and label as the partners page's door), and
 * the header names the area by the door's own key.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("the agency's home and header speak supply", () => {
  it("the agency home's one primary is the offer intake", () => {
    const screen = read("components/app/organization/company-model-screen.tsx");
    expect(screen).toMatch(/\) : agency \? \(\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*<Link\s+href=\{COMPANY_OFFER_INTAKE_HREF/);
    expect(screen).toContain('data-primary="agency-offer"');
    expect(screen).toContain('tAll("roleDashboards.company.agencyMode.actions.offer.label")');
    expect(read("app/[locale]/dashboard/page.tsx")).toMatch(/agency=\{agencyWorkspace\}/);
  });

  it("the header names an agency's need area by its door's key; a company keeps its own", () => {
    const agency = organizationHeaderAreas("agency").find((a) => a.id === "area:need");
    const company = organizationHeaderAreas("company").find((a) => a.id === "area:need");
    expect(agency?.tabLabelKey).toBe("organizationDoors.needsAgency");
    expect(company?.tabLabelKey).toBe("companyModel.need");
    expect(agency?.href).toBe(company?.href);
  });
});
