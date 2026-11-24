import { describe, it, expect } from "vitest";

import {
  buildImportSession,
  IMPORT_SESSION_MAX_ERRORS,
} from "./import-session";

const VALID = {
  sessionId: "imp-2026-08-01-001",
  sourceKey: "cvbankas_salary",
  transformVersion: "import-v1",
  startedAtIso: "2026-08-01T06:00:00Z",
  finishedAtIso: "2026-08-01T06:04:30Z",
  itemsScanned: 100,
  itemsAccepted: 80,
  itemsRejected: 15,
  itemsDuplicated: 5,
  reasonCounts: [
    { code: "schema_invalid", count: 10 },
    { code: "country_not_in_import_policy", count: 5 },
    { code: "duplicate", count: 5 },
  ],
  errors: ["row 17: unparsable payload"],
  rollbackRef: "session:imp-2026-08-01-001",
};

describe("buildImportSession — validating constructor", () => {
  it("accepts a well-formed session and derives the duration", () => {
    const result = buildImportSession(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.durationMs).toBe(270_000);
    expect(result.session.errorCount).toBe(1);
    expect(result.session.rollbackRef).toBe("session:imp-2026-08-01-001");
  });

  it("EXACT accounting: accepted + rejected + duplicated must equal scanned", () => {
    expect(
      buildImportSession({ ...VALID, itemsAccepted: 79 }),
    ).toEqual({ ok: false, reasonCode: "accounting_mismatch" });
    expect(
      buildImportSession({ ...VALID, itemsScanned: 101 }),
    ).toEqual({ ok: false, reasonCode: "accounting_mismatch" });
  });

  it("a session without a rollback reference is refused outright", () => {
    expect(buildImportSession({ ...VALID, rollbackRef: " " })).toEqual({
      ok: false,
      reasonCode: "missing_rollback_ref",
    });
  });

  it("refuses missing ids, bad timestamps, reversed time, negative counts", () => {
    expect(buildImportSession({ ...VALID, sessionId: "" })).toEqual({
      ok: false,
      reasonCode: "missing_field",
    });
    expect(
      buildImportSession({ ...VALID, startedAtIso: "not-a-date" }),
    ).toEqual({ ok: false, reasonCode: "invalid_timestamp" });
    expect(
      buildImportSession({
        ...VALID,
        startedAtIso: VALID.finishedAtIso,
        finishedAtIso: VALID.startedAtIso,
      }),
    ).toEqual({ ok: false, reasonCode: "finished_before_started" });
    expect(
      buildImportSession({ ...VALID, itemsRejected: -1 }),
    ).toEqual({ ok: false, reasonCode: "negative_count" });
    expect(
      buildImportSession({ ...VALID, itemsAccepted: 80.5 }),
    ).toEqual({ ok: false, reasonCode: "negative_count" });
  });

  it("refuses malformed reason tallies", () => {
    expect(
      buildImportSession({
        ...VALID,
        reasonCounts: [{ code: "", count: 1 }],
      }),
    ).toEqual({ ok: false, reasonCode: "invalid_reason_count" });
  });

  it("bounds stored errors but keeps the honest total count", () => {
    const manyErrors = Array.from(
      { length: IMPORT_SESSION_MAX_ERRORS + 20 },
      (_, i) => `row ${i}: failure`,
    );
    const result = buildImportSession({ ...VALID, errors: manyErrors });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.errors).toHaveLength(IMPORT_SESSION_MAX_ERRORS);
    expect(result.session.errorCount).toBe(IMPORT_SESSION_MAX_ERRORS + 20);
  });

  it("a zero-item session is valid (a run that found nothing is honest)", () => {
    const result = buildImportSession({
      ...VALID,
      itemsScanned: 0,
      itemsAccepted: 0,
      itemsRejected: 0,
      itemsDuplicated: 0,
      reasonCounts: [],
      errors: [],
    });
    expect(result.ok).toBe(true);
  });
});
