import { describe, expect, it } from "vitest";

import type {
  WorkIntelligenceOrganizationPeriodRecord,
  WorkIntelligenceOrganizationRecord,
} from "@/lib/journal/work-intelligence";
import {
  buildHistoryContext,
  type HistoryContextInput,
} from "@/lib/organization-evidence/professional-history-context";

import { buildCvOrganizationHistory } from "./organization-history";

const base: HistoryContextInput = {
  activityDate: "2025-03-04",
  periodStart: null,
  periodEnd: null,
  importedAt: "2026-09-16T09:17:33Z",
  contextLabel: null,
  activityKind: "work",
  workObjectId: null,
  workObjectName: null,
  projectId: "pr1",
  projectName: "Harbour Tower",
  parties: [{ role: "client", organizationId: null, label: "Nordic Build" }],
  organizationNames: new Map([["org1", "Acme Contractors"]]),
  relationshipKind: "employee",
  supplierRole: "employer",
  supplierOrganizationId: "org1",
  sourceKind: "xlsx",
  rowOrigin: "parsed_file",
  reportedState: "ORGANIZATION_REPORTED",
  attestation: null,
  independentlyVerified: false,
  contested: false,
};

const day = (
  id: string,
  workDate: string,
  hours: number,
  over: Partial<HistoryContextInput> = {},
): WorkIntelligenceOrganizationRecord => ({
  id,
  workDate,
  hours,
  source: "import",
  status: "recorded",
  organizationId: "org1",
  journalEntryId: null,
  context: buildHistoryContext({ ...base, activityDate: workDate, ...over }),
});

const period = (
  id: string,
  start: string,
  end: string,
  hours: number,
  over: Partial<HistoryContextInput> = {},
): WorkIntelligenceOrganizationPeriodRecord => ({
  id,
  periodStart: start,
  periodEnd: end,
  hours,
  source: "import",
  organizationId: "org1",
  provenance: "source",
  context: buildHistoryContext({ ...base, activityDate: null, periodStart: start, periodEnd: end, ...over }),
});

describe("buildCvOrganizationHistory", () => {
  it("carries project, client, capacity, source and supplier into one entry", () => {
    const [e] = buildCvOrganizationHistory([day("a", "2025-03-04", 8), day("b", "2025-03-05", 6.5)], []);
    expect(e.project).toBe("Harbour Tower");
    expect(e.organizationName).toBe("Acme Contractors");
    expect(e.clients).toEqual([{ role: "client", organizationId: null, label: "Nordic Build" }]);
    expect(e.relationshipKind).toBe("employee");
    expect(e.sourceKind).toBe("xlsx");
    expect(e.reconstructed).toBe(true);
    expect(e.from).toBe("2025-03-04");
    expect(e.to).toBe("2025-03-05");
  });

  it("states ONLY known hours: day sum and period figure stay separate, never summed, no day count", () => {
    const [e] = buildCvOrganizationHistory(
      [day("a", "2025-03-04", 8), day("b", "2025-03-05", 6.5)],
      [period("p", "2025-06-01", "2025-11-30", 800)],
    );
    expect(e.dayHours).toBe(14.5);
    expect(e.dayRecords).toBe(2);
    expect(e.periodHours).toBe(800);
    expect(e.periodRecords).toBe(1);
    expect(Object.keys(e)).not.toContain("days");
    expect(Object.keys(e)).not.toContain("totalHours");
    expect(e.to).toBe("2025-11-30");
  });

  it("no day records means dayHours is null (absent), not zero; likewise period", () => {
    const [onlyPeriod] = buildCvOrganizationHistory([], [period("p", "2025-06-01", "2025-11-30", 800)]);
    expect(onlyPeriod.dayHours).toBeNull();
    expect(onlyPeriod.dayRecords).toBe(0);
    const [onlyDay] = buildCvOrganizationHistory([day("a", "2025-03-04", 8)], []);
    expect(onlyDay.periodHours).toBeNull();
  });

  it("records without a context, and zero / invalid hours, add nothing", () => {
    const bare: WorkIntelligenceOrganizationRecord = {
      id: "x", workDate: "2025-01-01", hours: 8, source: "manual", status: "recorded",
      organizationId: "org1", journalEntryId: null,
    };
    expect(buildCvOrganizationHistory([bare, day("z", "2025-01-02", 0)], [])).toEqual([]);
  });

  it("is organization-provided, not self-attested: no SELF_DECLARED unless every record says so", () => {
    const [e] = buildCvOrganizationHistory([day("a", "2025-03-04", 8)], []);
    expect(e.proof).toEqual(["EVIDENCE_SUPPORTED"]);
    expect(e.proof).not.toContain("SELF_DECLARED");
    expect(e.proof).not.toContain("INDEPENDENTLY_VERIFIED");
  });

  it("a proof fact shows only when EVERY record in the entry holds it (intersection)", () => {
    const [e] = buildCvOrganizationHistory(
      [
        day("a", "2025-03-04", 8, { attestation: { role: "client", self: false } }),
        day("b", "2025-03-05", 8),
      ],
      [],
    );
    expect(e.proof).toEqual(["EVIDENCE_SUPPORTED"]);
    expect(e.proof).not.toContain("CLIENT_ACCEPTED");
    const [all] = buildCvOrganizationHistory(
      [
        day("a", "2025-03-04", 8, { attestation: { role: "client", self: false } }),
        day("b", "2025-03-05", 8, { attestation: { role: "client", self: false } }),
      ],
      [],
    );
    expect(all.proof).toContain("CLIENT_ACCEPTED");
    expect(all.attestedByRole).toBe("client");
  });

  it("a dispute on any record shows (union)", () => {
    const [e] = buildCvOrganizationHistory(
      [day("a", "2025-03-04", 8), day("b", "2025-03-05", 8, { contested: true })],
      [],
    );
    expect(e.contested).toBe(true);
  });

  it("different projects / clients / capacities are separate entries, never merged", () => {
    const entries = buildCvOrganizationHistory(
      [
        day("a", "2025-03-04", 8),
        day("b", "2025-03-05", 20, { projectId: "pr2", projectName: "Old Mill" }),
        day("c", "2025-03-06", 3, { relationshipKind: "subcontractor" }),
      ],
      [],
    );
    expect(entries).toHaveLength(3);
    // most stated hours first
    expect(entries[0].project).toBe("Old Mill");
  });

  it("an entry with no project, client or capacity still carries only what exists", () => {
    const [e] = buildCvOrganizationHistory(
      [
        day("a", "2025-03-04", 8, {
          projectId: null,
          projectName: null,
          parties: [],
          relationshipKind: null,
          sourceKind: null,
          rowOrigin: null,
        }),
      ],
      [],
    );
    expect(e.project).toBeNull();
    expect(e.clients).toEqual([]);
    expect(e.relationshipKind).toBeNull();
    expect(e.sourceKind).toBeNull();
    expect(e.reconstructed).toBe(false);
  });
});
