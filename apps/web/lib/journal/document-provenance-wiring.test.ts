/**
 * C2a wiring pins (value train 2) — the provenance contract between the
 * document-import seam and the canonical journal save.
 *
 * Source-scan style (the repo's guard convention): these break if someone
 * silently drops the RLS verification, starts trusting a client-supplied
 * extractor version, or reroutes provenance around the atomic save.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { documentProvenanceMetrics } from "./document-journal-draft-model";

// The canonical write moved from actions.ts into the transport-neutral
// journal-write-core.ts (owner-approved extraction, 2026-08-29 §6). The
// provenance contract these pins protect lives with the write — the guard
// follows the implementation, and a second copy appearing back in actions.ts
// would be caught by the not-duplicated pin below.
const ACTIONS = readFileSync(join(__dirname, "journal-write-core.ts"), "utf8");
const ACTIONS_WRAPPER = readFileSync(join(__dirname, "actions.ts"), "utf8");

describe("createJournalEntry — document provenance (C2a)", () => {
  it("the write was moved, not duplicated — actions.ts holds no second provenance path", () => {
    expect(ACTIONS_WRAPPER).not.toContain(
      "documentProvenanceMetrics(sourceDocumentFileId)",
    );
    expect(ACTIONS_WRAPPER).toContain("createJournalEntryCore");
  });
  it("reads the source document id from the form", () => {
    expect(ACTIONS).toContain('formData.get("source_document_file_id")');
  });

  it("verifies the claimed document under the caller's RLS before storing", () => {
    // The verification select must appear, and the refusal code with it.
    expect(ACTIONS).toMatch(/from\("document_files" as never\)/);
    expect(ACTIONS).toContain('"source_document_invalid"');
  });

  it("appends the provenance rows through the SAME atomic metrics array", () => {
    expect(ACTIONS).toContain("documentProvenanceMetrics(sourceDocumentFileId)");
  });

  it("never reads an extractor version from the client", () => {
    // The version is stamped server-side by the model constant; a form field
    // for it would let a caller spoof the extractor identity.
    expect(ACTIONS).not.toContain('formData.get("extractor_version")');
    const rows = documentProvenanceMetrics("11111111-2222-3333-4444-555555555555");
    expect(rows.some((r) => r.value_text.startsWith("deterministic-"))).toBe(true);
  });
});
