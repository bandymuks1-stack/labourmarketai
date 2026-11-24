import { describe, expect, it } from "vitest";

import {
  DOCUMENT_FILE_MAX_BYTES,
  DOCUMENT_FILE_MIME_TYPES,
  buildOrgDocumentFilePath,
  buildWorkerDocumentFilePath,
  currentDocumentFile,
  deriveAckProgress,
  isDocumentFileAbsentCode,
  isValidDocumentFile,
  isValidDocumentFileMime,
  nextDocumentFileVersion,
  noticeForDocumentRpcOutcome,
  safeDocumentFilename,
  type DocumentFileRow,
} from "@/lib/documents/document-file-model";

/**
 * Pure model tests for the Document & Evidence Engine v1. The SQL-side
 * behaviour (RLS matrix, RPC authority, fill-once, path verification) is
 * proven by scripts/db-proof/document-file-layer.sh against a throwaway
 * Postgres; these tests pin the TS half of the same single contract.
 */

function file(over: Partial<DocumentFileRow> & { version: number }): DocumentFileRow {
  return {
    id: `f${over.version}`,
    scope: "worker",
    workerDocumentId: "wd1",
    orgDocumentId: null,
    originalFilename: "doc.pdf",
    mimeType: "application/pdf",
    byteSize: 1000,
    uploadedAt: "2026-08-17T00:00:00Z",
    supersededAt: "2026-08-17T01:00:00Z",
    ...over,
  };
}

describe("version monotonicity (TS half of the RPC contract)", () => {
  it("next version is max + 1, never a gap-fill", () => {
    expect(nextDocumentFileVersion([])).toBe(1);
    expect(nextDocumentFileVersion([{ version: 1 }])).toBe(2);
    // A deleted/failed middle version never reuses a slot.
    expect(nextDocumentFileVersion([{ version: 1 }, { version: 5 }])).toBe(6);
  });

  it("exactly the non-superseded row is current; none → null", () => {
    const rows = [
      file({ version: 1 }),
      file({ version: 2 }),
      file({ version: 3, supersededAt: null }),
    ];
    expect(currentDocumentFile(rows)?.version).toBe(3);
    expect(currentDocumentFile([file({ version: 1 })])).toBeNull();
    expect(currentDocumentFile([])).toBeNull();
  });
});

describe("canonical storage paths (pinned by RPC + storage policies)", () => {
  it("worker and org paths follow the exact contract", () => {
    expect(buildWorkerDocumentFilePath("w1", "d1", 3, "a b.pdf")).toBe(
      "worker/w1/doc/d1/v3/a_b.pdf",
    );
    expect(buildOrgDocumentFilePath("o1", "d2", 1, "Zażółć-@!.pdf")).toBe(
      "org/o1/doc/d2/v1/Za_-_.pdf",
    );
  });

  it("filenames are storage-safe and bounded, never empty", () => {
    expect(safeDocumentFilename("../../etc/passwd")).not.toContain("/");
    expect(safeDocumentFilename("")).toBe("document.pdf");
    expect(safeDocumentFilename("x".repeat(300)).length).toBeLessThanOrEqual(100);
  });
});

describe("upload caps (one contract with the migration CHECKs)", () => {
  it("MIME allowlist matches the five admitted types", () => {
    expect([...DOCUMENT_FILE_MIME_TYPES]).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    expect(isValidDocumentFileMime("application/pdf")).toBe(true);
    expect(isValidDocumentFileMime("image/gif")).toBe(false);
    expect(isValidDocumentFileMime("text/html")).toBe(false);
  });

  it("size cap is exactly 5 MB (the repo's established upload cap)", () => {
    expect(DOCUMENT_FILE_MAX_BYTES).toBe(5242880);
    expect(isValidDocumentFile({ type: "application/pdf", size: 5242880 })).toBe(true);
    expect(isValidDocumentFile({ type: "application/pdf", size: 5242881 })).toBe(false);
    expect(isValidDocumentFile({ type: "application/pdf", size: 0 })).toBe(false);
  });
});

describe("acknowledgements are version-bound counts, nothing invented", () => {
  it("progress counts acknowledged vs assigned", () => {
    expect(
      deriveAckProgress([
        { acknowledgedAt: "2026-08-17T00:00:00Z" },
        { acknowledgedAt: null },
        { acknowledgedAt: null },
      ]),
    ).toEqual({ assigned: 3, acknowledged: 1 });
    expect(deriveAckProgress([])).toEqual({ assigned: 0, acknowledged: 0 });
  });
});

describe("honest degradation + outcome mapping", () => {
  it("the absent-store codes are the shared repo set", () => {
    for (const code of ["42P01", "42703", "42883", "PGRST202", "PGRST205"]) {
      expect(isDocumentFileAbsentCode(code)).toBe(true);
    }
    expect(isDocumentFileAbsentCode("23505")).toBe(false);
    expect(isDocumentFileAbsentCode(undefined)).toBe(false);
  });

  it("RPC outcome strings pass through; unknown becomes 'error', never a fake success", () => {
    expect(noticeForDocumentRpcOutcome("registered", "registered", "uploaded")).toBe(
      "uploaded",
    );
    expect(noticeForDocumentRpcOutcome("path_mismatch", "registered", "uploaded")).toBe(
      "path_mismatch",
    );
    expect(noticeForDocumentRpcOutcome("already_acknowledged", "acknowledged", "acknowledged")).toBe(
      "already_acknowledged",
    );
    expect(noticeForDocumentRpcOutcome("???", "registered", "uploaded")).toBe("error");
    expect(noticeForDocumentRpcOutcome("", "registered", "uploaded")).toBe("error");
  });
});
