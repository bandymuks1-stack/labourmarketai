import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

describe("the company context's centre is the company model, over existing surfaces", () => {
  // The doors moved into the ONE area model (2026-10-25, phase 2 of the one
  // navigation system); the screen renders them through the area switcher.
  const screen = read("lib/navigation/work-areas.ts");
  it("every entry is an existing canonical route", () => {
    const hrefs = [...screen.matchAll(/href: "(\/dashboard[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(13);
    for (const href of hrefs) {
      const page = join(WEB, "app", "[locale]", ...href.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(page), `${href} has no page`).toBe(true);
    }
  });
  it("the calendar entry is the ONE calendar, capacity is the workforce zone", () => {
    expect(screen).toMatch(/id: "calendar", href: "\/dashboard\/planning"/);
    expect(screen).toMatch(/id: "capacity", href: "\/dashboard\/company\/planning"/);
  });
  it("the screen renders every door from the area model, through the area switcher", () => {
    const view = read("components/app/organization/company-model-screen.tsx");
    expect(view).toMatch(/ORGANIZATION_WORK_AREAS\.map/);
    expect(view).toMatch(/<AreaSwitcher\b/);
    expect(view).toMatch(/testId: `company-model-\$\{a\.id\}`/);
  });
  it("is mounted as the opening context only inside a company organization workspace", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/activeOrgWorkspace && identity === "company" \? <CompanyModelScreen \/> : null/);
  });
  it("copy exists in every routed locale", () => {
    for (const loc of ["lt", "en", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as { companyModel: Record<string, string> };
      for (const k of ["title", "areasTitle", "need", "offer", "market", "people", "projects", "messages", "more", "clients", "candidates", "calendar", "capacity", "work", "results", "history"]) {
        expect(m.companyModel[k], `${loc}.${k}`).toBeTruthy();
      }
    }
  });
});
