import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mapOutcomesRow, OUTCOMES_K_ANONYMITY_FLOOR } from "@/lib/education/institution-outcomes";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * `institution_learner_outcomes_v1` was applied to production on 2026-09-03
 * with NO caller (recorded in the resume checkpoint). Owner contract §19:
 * a report comes from real state through the canonical read — this pins the
 * ONE caller, the privacy floor it honours, and the copy it shows.
 */
describe("institution learner outcomes — one caller, honest suppression", () => {
  it("exactly one module calls the aggregate function, and it reads no learner row", () => {
    const callers = walk(join(WEB, "lib"))
      .concat(walk(join(WEB, "components")), walk(join(WEB, "app")))
      .filter((p) => readFileSync(p, "utf8").includes("institution_learner_outcomes_v1"));
    expect(callers.map((p) => p.replace(WEB, "").replace(/\\/g, "/"))).toEqual(["/lib/education/institution-outcomes.ts"]);
    const src = read("lib/education/institution-outcomes.ts");
    expect(src).not.toMatch(/\.from\("(workers|profiles|journal_entries|booking_requests|company_worker_engagements)"\)/);
  });

  it("below the floor the four counts are null — never zeros pretending to be an answer", () => {
    expect(OUTCOMES_K_ANONYMITY_FLOOR).toBe(5);
    const suppressed = mapOutcomesRow({ learners_connected: 3, active_last_30d: null, with_interest_signals: null, with_accepted_bookings: null, with_active_engagements: null, suppressed: true, computed_at: "2026-09-04T00:00:00Z" });
    expect(suppressed).toMatchObject({ learnersConnected: 3, suppressed: true, activeLast30d: null, withActiveEngagements: null });
    const open = mapOutcomesRow({ learners_connected: 7, active_last_30d: 4, with_interest_signals: 2, with_accepted_bookings: 1, with_active_engagements: 1, suppressed: false, computed_at: "2026-09-04T00:00:00Z" });
    expect(open).toMatchObject({ learnersConnected: 7, suppressed: false, activeLast30d: 4, withInterestSignals: 2, withAcceptedBookings: 1, withActiveEngagements: 1 });
    expect(mapOutcomesRow(null)).toBeNull();
  });

  it("the institution's learners section renders the outcomes and SAYS when they are suppressed", () => {
    const sec = read("components/app/institution-learners-section.tsx");
    expect(sec).toContain("readInstitutionLearnerOutcomes(organizationId)");
    expect(sec).toContain('data-testid="institution-learner-outcomes-suppressed"');
    expect(sec).toContain("floor: OUTCOMES_K_ANONYMITY_FLOOR");
    expect(sec).toContain('t("outcomesEngagements"');
  });

  it("copy exists in the 5 routed catalogs (the roleDashboards namespace lives only there) and the suppression line names the floor", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const blk = JSON.parse(read(`messages/${locale}.json`)).roleDashboards.company.learners as Record<string, string>;
      for (const key of ["outcomesTitle", "outcomesSuppressed", "outcomesActive", "outcomesInterest", "outcomesBookings", "outcomesEngagements"]) {
        expect(blk[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(blk[key]).not.toMatch(/^\[EN\]/);
      }
      expect(blk.outcomesSuppressed).toContain("{floor}");
      expect(blk.outcomesSuppressed).toContain("{count}");
    }
  });
});
