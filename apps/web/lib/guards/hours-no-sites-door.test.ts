import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE HOURS PAGE'S "NO SITES" DOOR LEADS TO WHERE A SITE IS ADDED.
 *
 * Hours are recorded against a site (`work_objects`), never against a bare
 * project. The no-objects state used to offer "create first project": the
 * manager made a project, came back, and met the same empty state — a loop
 * with no way out (3 of 5 organizations with projects had no site on
 * 2026-10-19). The door now opens the sites form on the projects page, whose
 * fold opens for `#company-locations`.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("hours no-sites door", () => {
  const hours = read("app/[locale]/dashboard/hours/page.tsx");
  const projects = read("app/[locale]/dashboard/projects/page.tsx");

  it("points at the sites form, not at project creation", () => {
    expect(hours).toMatch(/href="\/dashboard\/projects#company-locations"/);
    expect(hours).not.toMatch(/href="\/dashboard\/company\/projects\/new"/);
    expect(hours).toMatch(/tSites\("addButton"\)/);
  });

  it("the anchor exists inside the fold that opens for it", () => {
    expect(projects).toMatch(/<DetailsHashOpener targetId="projects-more" \/>/);
    expect(projects).toMatch(/id="company-locations"/);
    const fold = projects.indexOf('id="projects-more"');
    const anchor = projects.indexOf('id="company-locations"');
    expect(fold).toBeGreaterThan(-1);
    expect(anchor).toBeGreaterThan(fold);
    expect(projects).toMatch(/<WorkObjectsSection/);
  });
});
