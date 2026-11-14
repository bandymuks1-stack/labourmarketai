import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ORGANIZATION CV: ONE WAY ONLY (#3354, owner 2026-11-14; decision 0025).
 *
 * An organization's track record is built from its people's and projects'
 * records. Nothing flows back: an owner's or a manager's PERSONAL CV never
 * receives the organization's hours, people or projects as their own. The
 * personal readers below may not import the organization readers, and the
 * organization's project summary carries no person, hours or skill.
 */
const dir = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(dir, p), "utf8");

const PERSONAL_READERS = [
  "lib/journal/professional-experience.ts",
  "lib/journal/professional-experience-read.ts",
  "lib/journal/work-intelligence-read.ts",
  "lib/organization-evidence/my-organizations-read.ts",
  "lib/organization-evidence/worker-evidence-read.ts",
  "app/[locale]/cv/page.tsx",
  "app/[locale]/dashboard/profile/page.tsx",
];

const ORGANIZATION_READERS = [
  "@/lib/organization-evidence/company-work-history-read",
  "@/lib/organization-evidence/company-work-history",
  "@/lib/organization-evidence/organization-projects",
];

describe("organization CV flows one way", () => {
  for (const file of PERSONAL_READERS) {
    it(`${file} does not read the organization's aggregate`, () => {
      const src = read(file);
      for (const mod of ORGANIZATION_READERS) {
        expect(src, `${file} imports ${mod}`).not.toContain(`"${mod}"`);
      }
    });
  }

  it("the organization's project summary names no person and no hours", () => {
    const src = read("lib/organization-evidence/organization-projects.ts");
    const item = src.slice(src.indexOf("export type OrganizationProjectItem"), src.indexOf("export type OrganizationProjects"));
    expect(item).not.toMatch(/hours|person|worker|skill|profile/i);
  });

  it("the projects are read for the organization, never for a person", () => {
    const src = read("lib/organization-evidence/company-work-history-read.ts");
    const at = src.indexOf('.from("projects")');
    expect(at, "the organization's projects are read here").toBeGreaterThan(-1);
    const query = src.slice(at, src.indexOf(".range(from, to)", at));
    expect(query).toContain('.eq("organization_id", org.organizationId)');
    expect(query).not.toMatch(/profile_id|worker_id|responsible_profile_id/);
  });
});
