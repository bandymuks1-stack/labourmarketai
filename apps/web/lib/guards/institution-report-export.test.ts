import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const ROUTE = "app/[locale]/dashboard/company/institution-report/export/route.ts";
const SECTION = "components/app/institution-programs-section.tsx";

/**
 * WHAT THIS PROTECTS — `J-INSTITUTION-OUTCOME`, last link.
 *
 * The link was BROKEN for one narrow reason: the institution could READ
 * employer demand per programme and READ its learner outcomes, and could
 * take neither anywhere. The export is that "anywhere". Three things about
 * it have to stay true, and each of them is a mistake this repository has
 * actually made before on some surface:
 *
 * 1. THE EXPORT IS REACHABLE. A route handler with no link is
 *    `/dashboard/learning` again — built, tested, merged, and openable only
 *    by typing a URL. The section must carry the anchor.
 * 2. THE EXPORT BORROWS ITS AUTHORISATION. The organisation id is in the
 *    query string, so it is a claim. The route must run
 *    `readInstitutionLearnerOutcomes` — whose SQL function admits only a
 *    manager of a `training_provider` organisation — BEFORE it emits a byte,
 *    and must refuse rather than export when that gate is unreachable. A
 *    second membership rule written here could be laxer than the one the
 *    screen enforces.
 * 3. THE EXPORT COMPOSES THE SAME READS THE SCREEN USES. A second demand or
 *    outcome reader is how the file and the page start disagreeing.
 */
describe("institution report export — reachable, gated, composed", () => {
  const route = read(ROUTE);
  const section = read(SECTION);

  it("is linked from the institution programmes section", () => {
    expect(section).toContain("institution-report-export");
    expect(section).toContain("/dashboard/company/institution-report/export");
  });

  it("offers the link only when there is a programme to report on", () => {
    expect(section).toContain("read.programs.length > 0");
  });

  it("runs the outcomes gate before reading programmes", () => {
    const gate = route.indexOf("readInstitutionLearnerOutcomes(");
    const programs = route.indexOf("readInstitutionPrograms(");
    expect(gate).toBeGreaterThan(-1);
    expect(programs).toBeGreaterThan(gate);
  });

  it("answers 403 to a caller the gate refuses", () => {
    expect(route).toMatch(/reason === "forbidden"[\s\S]{0,160}status: 403/);
  });

  it("refuses instead of exporting when the gate itself is unreachable", () => {
    expect(route).toMatch(/status: 503/);
    // Every unavailable branch must return; no path may fall through to the
    // CSV with the gate unanswered.
    const afterGate = route.slice(route.indexOf('outcomesRead.status === "unavailable"'));
    expect(afterGate.indexOf("buildInstitutionReportCsv")).toBeGreaterThan(
      afterGate.indexOf("status: 503"),
    );
  });

  it("validates the organisation id as a uuid before touching the database", () => {
    expect(route).toMatch(/UUID\.test\(organizationId\)[\s\S]{0,120}status: 400/);
  });

  it("uses no service role and opens no second reader", () => {
    expect(route).not.toMatch(/service_role|SERVICE_ROLE|createServiceClient|admin/i);
    // No direct RPC of its own: both reads go through their canonical
    // modules, so the single-permitted-caller pin on the outcomes function
    // (institution-learner-outcomes-caller) stays a closed one-entry list.
    expect(route).not.toMatch(/\.rpc\(/);
    expect(route).not.toContain("count_public_vacancies_by_profession_v1");
  });

  it("sends the file as a download that is never cached", () => {
    expect(route).toContain("text/csv; charset=utf-8");
    expect(route).toContain("attachment; filename=");
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});
