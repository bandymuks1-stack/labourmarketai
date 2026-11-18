import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Acting for organization X" means ONE thing: X's projects. Production walk
 * 2026-09-28: a manager of two synthetic organizations, acting for Gama, saw
 * Alfa's project and its assigned worker on Gama's home — the shared project
 * list took every project RLS let the person see. The list behind the org
 * home, the chat's project pickers, tasks, stages, readiness and risk is now
 * pinned to the acting organization (legacy rows by their company id).
 */
const src = readFileSync(join(__dirname, "..", "projects", "project-workspace.ts"), "utf8");
const fn = src.slice(src.indexOf("export async function loadProjectsForResult("));

describe("the organization's project list is the acting organization's", () => {
  it("resolves the acting company context before reading", () => {
    expect(fn.indexOf("resolveEmployerCompanyContext()")).toBeGreaterThan(-1);
    expect(fn.indexOf("resolveEmployerCompanyContext()")).toBeLessThan(fn.indexOf('.from("projects")'));
  });
  it("filters the projects read to that organization (or its legacy company rows)", () => {
    const read = fn.slice(fn.indexOf('.from("projects")'), fn.indexOf(".limit(PROJECT_RESULT_LIMIT)"));
    expect(read).toMatch(/organization_id\.eq\.\$\{ctx\.organizationId\}/);
    expect(read).toMatch(/organization_id\.is\.null,company_id\.eq\.\$\{ctx\.companyId\}/);
  });
});
