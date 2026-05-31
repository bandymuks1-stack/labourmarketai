import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Project/client context first-runtime slice — honesty + read-only guard.
 *
 * The slice connects the now-live project/client/work-item DB foundation to an
 * honest read-first empty state. It must: read only (no writes), fabricate no
 * project/client/task, and state the layer is structurally ready (not "being
 * prepared from scratch") and not auto-filled.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("project-context helper — read-only, real count", () => {
  const src = read("lib/company/project-context.ts");
  it("reads the real projects count (RLS-scoped by company)", () => {
    expect(src).toMatch(/\.from\("projects"\)/);
    expect(src).toMatch(/count: "exact", head: true/);
    expect(src).toMatch(/\.eq\("company_id", companyId\)/);
  });
  it("performs no writes and fabricates no rows", () => {
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
  it("does not invent project/client/task literals", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/sample|demo|fake|mock|placeholder/i);
  });
});

describe("company page renders the honest empty state with a real count", () => {
  const page = read("app/[locale]/dashboard/company/page.tsx");
  it("computes the context read-only and shows the count + ready badge", () => {
    expect(page).toMatch(/getCompanyProjectContext/);
    expect(page).toMatch(/projectContext\.projects/);
    expect(page).toMatch(/tOps\("projectsReadyBadge"\)/);
    expect(page).toMatch(/tOps\("projectsCount"\)/);
  });
});

describe("copy is honest: structurally ready, not auto-filled, no fake data", () => {
  for (const locale of ["lt", "en"] as const) {
    const base = JSON.parse(read(`messages/${locale}.json`)) as {
      companyOps: Record<string, string>;
      reviewReport: { projectNote: string };
    };
    it(`${locale} companyOps has the readiness keys`, () => {
      for (const k of ["projectsTitle", "projectsReadyBadge", "projectsBody", "projectsCount", "projectsEmpty"]) {
        expect(base.companyOps[k], `${locale} companyOps.${k}`).toBeTruthy();
      }
    });
    it(`${locale} projectNote says entries CAN be linked (ready), not "being prepared"`, () => {
      const note = base.reviewReport.projectNote.toLowerCase();
      expect(note).toMatch(/gali būti susiet|can be linked/);
      expect(note).toMatch(/paruošt|ready/);
    });
    it(`${locale} projectsBody states nothing is auto-filled`, () => {
      const body = base.companyOps.projectsBody.toLowerCase();
      expect(body).toMatch(/neužpildoma automati|nothing is filled automatically/);
    });
  }
});
