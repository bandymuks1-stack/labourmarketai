import { describe, expect, it } from "vitest";

import {
  OPS_CSV_HEADER,
  buildOperationsCsv,
  csvCell,
  operationsCsvFilename,
} from "@/lib/projects/operations-report";
import type { ProjectOperations, WorkerOps } from "@/lib/projects/operations-derive";

/**
 * Pilot Operations Launch v1 — the CSV export must serialise ONLY real rows. An
 * empty project produces a header-only file (never fake rows), readiness mirrors
 * the derived flag exactly, and cells are safely escaped.
 */

const worker = (over: Partial<WorkerOps>): WorkerOps => ({
  workerId: "w",
  workerProfileId: "p",
  name: "Jonas",
  assignedAt: "2026-06-01T00:00:00Z",
  journalEntries: 1,
  declaredSkills: 2,
  confirmedSkills: 0,
  openReviewItems: 0,
  lastActivity: "2026-06-02T00:00:00Z",
  ready: true,
  missing: [],
  needsFollowUp: false,
  operationalStatus: null,
  readinessItems: [],
  docsMissing: 0,
  docsReceived: 0,
  docsChecked: 0,
  docsBlocked: 0,
  ...over,
});

const ops = (workers: WorkerOps[]): ProjectOperations => ({
  project: {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Vilnius site",
    city: "Vilnius",
    country: "LT",
    startDate: "2026-06-10",
    endDate: null,
    status: "live",
  },
  workers,
  counters: {
    totalAssigned: workers.length,
    ready: workers.filter((w) => w.ready).length,
    needsDeclaredSkills: 0,
    needsEvidence: 0,
    needsFollowUp: 0,
    openReviewItems: 0,
    instructionsSent: 0,
    byOperationalStatus: {
      candidate: 0,
      contacted: 0,
      interested: 0,
      documents_needed: 0,
      ready: 0,
      assigned: 0,
      unavailable: 0,
      rejected: 0,
    },
    withMissingDocs: 0,
    docsMissing: 0,
    docsReceived: 0,
    docsChecked: 0,
    docsBlocked: 0,
  },
});

describe("csvCell escaping", () => {
  it("quotes cells containing commas, quotes, or newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildOperationsCsv — real data only", () => {
  it("an empty project produces a header-only CSV (no fabricated rows)", () => {
    const csv = buildOperationsCsv(ops([]));
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(OPS_CSV_HEADER.join(","));
  });

  it("readiness column mirrors the derived flag, not an invented label", () => {
    const csv = buildOperationsCsv(ops([worker({ ready: true }), worker({ ready: false, name: "Petras" })]));
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("ready_checked_fields");
    expect(lines[2]).toContain("not_ready");
    // never an unbacked claim
    expect(csv).not.toMatch(/verified|approved|guaranteed/i);
  });

  it("escapes a worker name with a comma so columns stay aligned", () => {
    const csv = buildOperationsCsv(ops([worker({ name: "Doe, John" })]));
    expect(csv).toContain('"Doe, John"');
  });

  it("includes v2 operational status + checklist columns from real data", () => {
    expect(OPS_CSV_HEADER).toContain("operational_status");
    expect(OPS_CSV_HEADER).toContain("docs_missing");
    expect(OPS_CSV_HEADER).toContain("docs_checked");
    const csv = buildOperationsCsv(
      ops([worker({ operationalStatus: "documents_needed", docsMissing: 3, docsChecked: 1 })]),
    );
    const cols = csv.trimEnd().split("\r\n")[1].split(",");
    expect(cols[OPS_CSV_HEADER.indexOf("operational_status")]).toBe("documents_needed");
    expect(cols[OPS_CSV_HEADER.indexOf("docs_missing")]).toBe("3");
    expect(cols[OPS_CSV_HEADER.indexOf("docs_checked")]).toBe("1");
  });

  it("shows not_set when no operational status is assigned (never invented)", () => {
    const csv = buildOperationsCsv(ops([worker({ operationalStatus: null })]));
    const cols = csv.trimEnd().split("\r\n")[1].split(",");
    expect(cols[OPS_CSV_HEADER.indexOf("operational_status")]).toBe("not_set");
  });

  it("filename is scoped to the project and filesystem-safe", () => {
    expect(operationsCsvFilename(ops([]))).toBe("operations-vilnius-site.csv");
  });
});
