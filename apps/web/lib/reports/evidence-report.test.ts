import { describe, it, expect } from "vitest";
import { buildEvidenceReport, type EvidenceReportInput } from "./evidence-report";

const base: EvidenceReportInput = {
  tierCounts: { self_declared: 0, work_supported: 0, manager_confirmed: 0, verified: 0 },
  supportedSkills: [],
  unsupportedSkills: [],
  awaitingConfirmation: [],
  journalEntries: 0,
  confirmations: 0,
  hasWorkNeedContext: false,
};

describe("evidence report model", () => {
  it("empty input → honest empty/not-available sections, no fabricated totals", () => {
    const r = buildEvidenceReport(base);
    expect(r.totalSkills).toBe(0);
    const byKey = Object.fromEntries(r.sections.map((s) => [s.key, s]));
    expect(byKey.profileEvidence.state).toBe("empty");
    expect(byKey.skillsSupported.state).toBe("empty");
    expect(byKey.fitReadiness.state).toBe("not_available");
  });

  it("separates the evidence ladder honestly (no inflation)", () => {
    const r = buildEvidenceReport({
      ...base,
      tierCounts: { self_declared: 4, work_supported: 2, manager_confirmed: 1, verified: 0 },
      supportedSkills: ["Sienų tinkavimas", "Langų valymas"],
      unsupportedSkills: ["Excel ataskaitų pildymas"],
      awaitingConfirmation: ["Sienų tinkavimas"],
      journalEntries: 3,
      confirmations: 1,
    });
    const byKey = Object.fromEntries(r.sections.map((s) => [s.key, s]));
    expect(r.totalSkills).toBe(7);
    expect(byKey.profileEvidence.metrics.confirmed).toBe(1);
    expect(byKey.profileEvidence.metrics.selfDeclared).toBe(4);
    expect(byKey.skillsSupported.metrics.count).toBe(2);
    expect(byKey.workEntrySummary.metrics.entries).toBe(3);
    expect(byKey.missingEvidence.metrics.needEvidence).toBe(1);
    expect(byKey.missingEvidence.metrics.needConfirmation).toBe(1);
  });

  it("fit readiness is not_available without a work-need context (no fake fit)", () => {
    const r = buildEvidenceReport({ ...base, supportedSkills: ["x"], hasWorkNeedContext: false });
    const fit = r.sections.find((s) => s.key === "fitReadiness")!;
    expect(fit.state).toBe("not_available");
  });

  it("always returns the five report sections in order", () => {
    expect(buildEvidenceReport(base).sections.map((s) => s.key)).toEqual([
      "profileEvidence",
      "skillsSupported",
      "workEntrySummary",
      "missingEvidence",
      "fitReadiness",
    ]);
  });
});