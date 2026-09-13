import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SUPPRESSED_CELL,
  UNKNOWN_CELL,
  activeLearnerCount,
  buildInstitutionReportCsv,
  institutionReportCsvFilename,
} from "./institution-report";
import type { ProgramRow } from "./programs";

/**
 * WHAT THIS PROTECTS.
 *
 * The export exists so an institution can take its programme demand and its
 * learner outcomes somewhere. A spreadsheet is read without the screen's
 * words around it, so the two separations that guard those numbers have to
 * survive serialisation or the file becomes the most dangerous surface in
 * the product:
 *
 *   SEP-7  UNKNOWN ≠ ZERO — a programme whose direction the vacancy count
 *          does not carry must never export as `0` live vacancies. An
 *          institution plans against a 0; it asks a question about an
 *          `unknown`.
 *   The k-anonymity floor — below it the SQL function nulls the four
 *          outcome counts on purpose. A null that prints as `0` (or as an
 *          empty cell, which a spreadsheet shows as 0 in a SUM) turns a
 *          privacy guarantee into a false measurement.
 *
 * And one disclosure rule: no person may appear in the file. The programme
 * block counts learners; it never carries an id or a label.
 */

const cohort = (members: Array<{ id: string; status: "active" | "left" }>) => ({
  id: "c1",
  name: "Cohort",
  startsOn: null,
  endsOn: null,
  members: members.map((m) => ({ profileId: m.id, status: m.status, label: `label-${m.id}` })),
});

const program = (over: Partial<ProgramRow> = {}): ProgramRow => ({
  id: "prog-1",
  name: "Scaffolding course",
  targetProfessionSlug: "builder",
  educationTypeSlug: "vocational",
  description: null,
  demandCount: 12,
  cohorts: [],
  ...over,
});

const OK_OUTCOMES = {
  status: "ok" as const,
  outcomes: {
    learnersConnected: 9,
    suppressed: false,
    activeLast30d: 4,
    withInterestSignals: 3,
    withAcceptedBookings: 2,
    withActiveEngagements: 1,
    computedAt: "2026-09-13T00:00:00Z",
  },
};

const SUPPRESSED_OUTCOMES = {
  status: "ok" as const,
  outcomes: {
    learnersConnected: 1,
    suppressed: true,
    activeLast30d: null,
    withInterestSignals: null,
    withAcceptedBookings: null,
    withActiveEngagements: null,
    computedAt: "2026-09-13T00:00:00Z",
  },
};

function blocks(csv: string): { programs: string[]; outcomes: string[] } {
  const lines = csv.replace(/\r\n$/, "").split("\r\n");
  const gap = lines.indexOf("");
  expect(gap).toBeGreaterThan(0);
  return { programs: lines.slice(0, gap), outcomes: lines.slice(gap + 1) };
}

describe("institution report — an unknown demand never exports as zero (SEP-7)", () => {
  it("writes `unknown` for a programme with no work direction", () => {
    const csv = buildInstitutionReportCsv(
      [program({ targetProfessionSlug: null, demandCount: null })],
      OK_OUTCOMES,
    );
    const row = blocks(csv).programs[1];
    expect(row.endsWith(`,${UNKNOWN_CELL}`)).toBe(true);
    expect(row.endsWith(",0")).toBe(false);
  });

  it("writes `unknown` for a direction the vacancy count does not carry", () => {
    // Production's `builder` programme on 2026-09-13: the direction IS set,
    // and `count_public_vacancies_by_profession_v1` returns 20 professions
    // without it. Null here means unmeasured, not empty.
    const csv = buildInstitutionReportCsv([program({ demandCount: null })], OK_OUTCOMES);
    expect(blocks(csv).programs[1]).toContain(UNKNOWN_CELL);
  });

  it("writes a real zero when the count actually measured zero", () => {
    const csv = buildInstitutionReportCsv([program({ demandCount: 0 })], OK_OUTCOMES);
    const row = blocks(csv).programs[1];
    expect(row.endsWith(",0")).toBe(true);
    expect(row).not.toContain(UNKNOWN_CELL);
  });
});

describe("institution report — the k-anonymity floor survives the file", () => {
  it("prints `suppressed`, never 0 and never blank, below the floor", () => {
    const csv = buildInstitutionReportCsv([program()], SUPPRESSED_OUTCOMES);
    const out = blocks(csv).outcomes;
    expect(out).toContain(`status,${"suppressed_below_floor"}`);
    for (const metric of [
      "active_last_30d",
      "with_interest_signals",
      "with_accepted_bookings",
      "with_active_engagements",
    ]) {
      expect(out).toContain(`${metric},${SUPPRESSED_CELL}`);
      expect(out).not.toContain(`${metric},0`);
      expect(out).not.toContain(`${metric},`.concat(""));
    }
    // The connected count is NOT suppressed — the floor nulls the four
    // outcome counts, not the number of learners the institution can
    // already see in its own learners section.
    expect(out).toContain("learners_connected,1");
  });

  it("states an unavailable outcomes read instead of omitting the block", () => {
    const csv = buildInstitutionReportCsv([program()], {
      status: "unavailable",
      reason: "not_applied",
    });
    expect(blocks(csv).outcomes).toEqual(["metric,value", "status,unavailable_not_applied"]);
  });
});

describe("institution report — no person appears in the file", () => {
  it("counts active learners once and carries no id or label", () => {
    const p = program({
      cohorts: [
        cohort([
          { id: "p1", status: "active" },
          { id: "p2", status: "left" },
        ]),
        { ...cohort([{ id: "p1", status: "active" }]), id: "c2" },
      ],
    });
    expect(activeLearnerCount(p)).toBe(1);
    const csv = buildInstitutionReportCsv([p], OK_OUTCOMES);
    expect(csv).not.toContain("p1");
    expect(csv).not.toContain("label-");
  });
});

describe("institution report — shape and escaping", () => {
  it("quotes a programme name carrying a comma", () => {
    const csv = buildInstitutionReportCsv([program({ name: 'Course, level "2"' })], OK_OUTCOMES);
    expect(blocks(csv).programs[1].startsWith('"Course, level ""2"""')).toBe(true);
  });

  it("emits both headers even with no programme", () => {
    const csv = buildInstitutionReportCsv([], OK_OUTCOMES);
    const b = blocks(csv);
    expect(b.programs).toEqual(["program_name,direction_profession,education_type,cohorts,active_learners,active_public_vacancies"]);
    expect(b.outcomes[0]).toBe("metric,value");
  });

  it("stamps the filename with the export day", () => {
    expect(institutionReportCsvFilename("2026-09-13")).toBe("institution-report-2026-09-13.csv");
  });
});

describe("institution report — it reads nothing of its own", () => {
  const src = readFileSync(resolve(__dirname, "institution-report.ts"), "utf8");

  it("is pure: no supabase client, no fetch, no rpc", () => {
    expect(src).not.toMatch(/createClient|supabase|\.rpc\(|fetch\(/);
  });

  it("reuses the canonical CSV cell escaper rather than writing a second one", () => {
    expect(src).toContain('from "@/lib/projects/operations-report"');
  });
});
