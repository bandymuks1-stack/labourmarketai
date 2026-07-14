import { describe, it, expect } from "vitest";

import { buildImportSession, type ImportSessionV1 } from "./import-session";
import { buildImportReport } from "./import-report";

function session(overrides: Partial<Parameters<typeof buildImportSession>[0]> = {}): ImportSessionV1 {
  const result = buildImportSession({
    sessionId: "imp-001",
    sourceKey: "cvbankas_salary",
    transformVersion: "import-v1",
    startedAtIso: "2026-08-01T06:00:00Z",
    finishedAtIso: "2026-08-01T06:05:00Z",
    itemsScanned: 100,
    itemsAccepted: 90,
    itemsRejected: 6,
    itemsDuplicated: 4,
    reasonCounts: [
      { code: "schema_invalid", count: 6 },
      { code: "duplicate", count: 4 },
    ],
    errors: [],
    rollbackRef: "session:imp-001",
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture session invalid: ${result.reasonCode}`);
  return result.session;
}

describe("buildImportReport — one report per session, fixed status rules", () => {
  it("carries summary, skipped tallies, duplicates and the rollback ref", () => {
    const report = buildImportReport(session());
    expect(report.summary).toEqual({
      itemsScanned: 100,
      itemsAccepted: 90,
      itemsRejected: 6,
      itemsDuplicated: 4,
      durationMs: 300_000,
    });
    expect(report.skipped).toEqual([
      { code: "schema_invalid", count: 6 },
      { code: "duplicate", count: 4 },
    ]);
    expect(report.duplicates).toBe(4);
    expect(report.rollbackRef).toBe("session:imp-001");
  });

  it("rejections without errors → partial (never silently success)", () => {
    expect(buildImportReport(session()).finalStatus).toBe("partial");
  });

  it("clean run → success; an all-duplicate re-run is also a success", () => {
    expect(
      buildImportReport(
        session({ itemsAccepted: 100, itemsRejected: 0, itemsDuplicated: 0, reasonCounts: [] }),
      ).finalStatus,
    ).toBe("success");
    expect(
      buildImportReport(
        session({
          itemsAccepted: 0,
          itemsRejected: 0,
          itemsDuplicated: 100,
          reasonCounts: [{ code: "duplicate", count: 100 }],
        }),
      ).finalStatus,
    ).toBe("success");
  });

  it("errors with nothing accepted → failed; errors with acceptances → partial", () => {
    expect(
      buildImportReport(
        session({
          itemsAccepted: 0,
          itemsRejected: 100,
          itemsDuplicated: 0,
          errors: ["boom"],
        }),
      ).finalStatus,
    ).toBe("failed");
    expect(
      buildImportReport(session({ errors: ["one row broke"] })).finalStatus,
    ).toBe("partial");
  });

  it("ANY privacy issue blocks the session — privacy outranks everything", () => {
    const report = buildImportReport(
      session({ itemsAccepted: 100, itemsRejected: 0, itemsDuplicated: 0, reasonCounts: [] }),
      { privacyIssueCodes: ["cohort_below_floor"] },
    );
    expect(report.finalStatus).toBe("blocked");
    expect(report.privacyIssueCodes).toEqual(["cohort_below_floor"]);
  });

  it("refuses empty warning/privacy codes", () => {
    expect(() =>
      buildImportReport(session(), { warningCodes: [" "] }),
    ).toThrow(/non-empty/);
  });
});
