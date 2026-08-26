import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  countCurrentEngagements,
  deriveWorkHistory,
  isRecordedEngagement,
  type WorkHistorySourceRow,
} from "@/lib/player-card/work-history-model";

/**
 * THE SCAFFOLD ROW IS NOT A JOB.
 *
 * `ensure_worker_personal_engagement` (20260702140000) gives every worker an
 * engagement context the moment their `workers` row appears, so the journal
 * composer has somewhere to write. It has no organization, no title and no
 * dates — and every history surface printed it anyway, as an "Employee" with
 * no employer.
 *
 * Production, 2026-08-26: 35 of 36 profiles carry exactly that row. Every one
 * of those people had a phantom job on their CV.
 */

const row = (o: Partial<WorkHistorySourceRow> = {}): WorkHistorySourceRow => ({
  id: "e1",
  title: null,
  relationship_slug: "employee",
  started_at: null,
  ended_at: null,
  status: "active",
  country_code: "LT",
  organizations: null,
  ...o,
});

describe("a row that asserts nothing is not history", () => {
  it("drops the trigger-provisioned scaffold exactly as it exists in production", () => {
    // organization NULL, title NULL, both dates NULL, active, employee.
    expect(isRecordedEngagement(row())).toBe(false);
    expect(deriveWorkHistory([row()])).toEqual([]);
  });

  it("stops counting it as a current engagement", () => {
    expect(countCurrentEngagements(deriveWorkHistory([row()]))).toBe(0);
  });

  it("an empty-string title or date is still nothing", () => {
    expect(isRecordedEngagement(row({ title: "   ", started_at: "" }))).toBe(false);
  });
});

describe("every row that records something real survives", () => {
  it("keeps a self-declared row — the RPC guarantees it has a title", () => {
    expect(deriveWorkHistory([row({ title: "UAB Statyba — mūrininkas" })]))
      .toHaveLength(1);
  });

  it("keeps an organization-linked row even with no title and no dates", () => {
    const kept = deriveWorkHistory([
      row({ organizations: { display_name: "Dev Construction", legal_name: null } }),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].organizationName).toBe("Dev Construction");
  });

  it("falls back to the legal name before deciding a row is empty", () => {
    expect(
      isRecordedEngagement(
        row({ organizations: { display_name: null, legal_name: "Dev BV" } }),
      ),
    ).toBe(true);
  });

  it("ONE recorded date is enough — a stated fact is never tidied away", () => {
    expect(deriveWorkHistory([row({ started_at: "2019-03-01" })])).toHaveLength(1);
    expect(deriveWorkHistory([row({ ended_at: "2022-10-01" })])).toHaveLength(1);
  });
});

describe("the CV and the profile card apply the SAME rule", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

  it("the CV filters through the shared predicate, not its own copy", () => {
    expect(read("lib/cv-export/verified-cv.ts")).toContain("isRecordedEngagement");
  });

  it("the work-log context picker does NOT filter it out", () => {
    // The scaffold row is a valid CONTEXT (rule D in
    // engagement-context-selection.ts) — a person logging their own work needs
    // it. This is a rule about history, not about contexts, and confusing the
    // two would take the journal away from every worker without an employer.
    expect(read("lib/conversation/worklog-engagements.ts")).not.toContain(
      "isRecordedEngagement",
    );
  });
});
