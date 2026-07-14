/**
 * IMPORT REPORT contract (Source Readiness v1).
 *
 * Every future import session must automatically produce exactly one
 * report: summary, errors, warnings, skipped items (per reason),
 * duplicates, privacy issues, final status. No import runtime exists yet
 * and this module performs no import — it derives the report
 * deterministically from a validated ImportSessionV1 record.
 *
 * Final-status rules (fixed precedence — a report can never upgrade
 * itself):
 *   1. any privacy issue                → "blocked"  (privacy outranks all)
 *   2. errors and nothing accepted      → "failed"
 *   3. errors or rejections             → "partial"
 *   4. otherwise                        → "success"  (an all-duplicate
 *      re-run is a success — idempotent ingest is the designed behaviour)
 *
 * Pure module: no IO, no Date.now. i18n codes only.
 */
import type { ImportSessionV1 } from "./import-session";

export const IMPORT_FINAL_STATUSES = [
  "success",
  "partial",
  "failed",
  "blocked",
] as const;
export type ImportFinalStatus = (typeof IMPORT_FINAL_STATUSES)[number];

export interface ImportReportV1 {
  readonly sessionId: string;
  readonly sourceKey: string;
  readonly summary: {
    readonly itemsScanned: number;
    readonly itemsAccepted: number;
    readonly itemsRejected: number;
    readonly itemsDuplicated: number;
    readonly durationMs: number;
  };
  /** Bounded structural error messages + the honest total count. */
  readonly errors: readonly string[];
  readonly errorCount: number;
  /** Stable warning codes (non-fatal observations about the run). */
  readonly warningCodes: readonly string[];
  /** Skipped (rejected/duplicated) items per stable reason code. */
  readonly skipped: readonly { readonly code: string; readonly count: number }[];
  readonly duplicates: number;
  /** Stable privacy-issue codes — ANY entry blocks the whole session. */
  readonly privacyIssueCodes: readonly string[];
  readonly finalStatus: ImportFinalStatus;
  /** Carried verbatim from the session — a report always names the way back. */
  readonly rollbackRef: string;
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Derive the one report for a session. Throws only on structurally
 * impossible extras (empty codes) — the session itself was already
 * validated by buildImportSession.
 */
export function buildImportReport(
  session: ImportSessionV1,
  extras: {
    warningCodes?: readonly string[];
    privacyIssueCodes?: readonly string[];
  } = {},
): ImportReportV1 {
  const warningCodes = extras.warningCodes ?? [];
  const privacyIssueCodes = extras.privacyIssueCodes ?? [];
  if (!warningCodes.every(isNonEmpty) || !privacyIssueCodes.every(isNonEmpty)) {
    throw new Error(
      "ImportReportV1: warning/privacy codes must all be non-empty",
    );
  }

  let finalStatus: ImportFinalStatus;
  if (privacyIssueCodes.length > 0) {
    finalStatus = "blocked";
  } else if (session.errorCount > 0 && session.itemsAccepted === 0) {
    finalStatus = "failed";
  } else if (session.errorCount > 0 || session.itemsRejected > 0) {
    finalStatus = "partial";
  } else {
    finalStatus = "success";
  }

  return {
    sessionId: session.sessionId,
    sourceKey: session.sourceKey,
    summary: {
      itemsScanned: session.itemsScanned,
      itemsAccepted: session.itemsAccepted,
      itemsRejected: session.itemsRejected,
      itemsDuplicated: session.itemsDuplicated,
      durationMs: session.durationMs,
    },
    errors: session.errors,
    errorCount: session.errorCount,
    warningCodes: [...warningCodes],
    skipped: [...session.reasonCounts],
    duplicates: session.itemsDuplicated,
    privacyIssueCodes: [...privacyIssueCodes],
    finalStatus,
    rollbackRef: session.rollbackRef,
  };
}
