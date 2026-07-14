/**
 * Intelligence IMPORT SESSION model (Source Readiness v1).
 *
 * The contract every FUTURE import run must produce — no import runtime
 * exists yet and this module performs none. A session is an accounting
 * record: every scanned item must be accounted for as accepted, rejected
 * or duplicated (exact-sum invariant), the timestamps must be sane, and a
 * rollback reference is MANDATORY — a session that cannot be rolled back
 * must never run.
 *
 * The builder is a validating constructor with a result type: malformed
 * accounting is refused with a stable reason code, never silently stored.
 *
 * Pure module: no IO, no Date.now (durations come from the recorded
 * timestamps). i18n codes only.
 */

/** Errors kept verbatim on the session record (rest is counted only). */
export const IMPORT_SESSION_MAX_ERRORS = 50;

export interface ImportSessionReasonCountV1 {
  /** Stable machine reason code (e.g. "duplicate", "schema_invalid"). */
  readonly code: string;
  readonly count: number;
}

export interface ImportSessionV1 {
  readonly sessionId: string;
  readonly sourceKey: string;
  /** Transform/import code version that produced this session. */
  readonly transformVersion: string;
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
  /** Derived: finished − started, in milliseconds. */
  readonly durationMs: number;
  readonly itemsScanned: number;
  readonly itemsAccepted: number;
  readonly itemsRejected: number;
  readonly itemsDuplicated: number;
  /** Per-reason rejection/duplication tallies. */
  readonly reasonCounts: readonly ImportSessionReasonCountV1[];
  /** First N structural error messages (bounded); errorCount is honest. */
  readonly errors: readonly string[];
  readonly errorCount: number;
  /** MANDATORY pointer to the rollback handle for this session. */
  readonly rollbackRef: string;
}

export type ImportSessionBuildReasonCode =
  | "missing_field"
  | "invalid_timestamp"
  | "finished_before_started"
  | "negative_count"
  | "accounting_mismatch"
  | "invalid_reason_count"
  | "missing_rollback_ref";

export type ImportSessionBuildResult =
  | { readonly ok: true; readonly session: ImportSessionV1 }
  | { readonly ok: false; readonly reasonCode: ImportSessionBuildReasonCode };

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

export function buildImportSession(input: {
  sessionId: string;
  sourceKey: string;
  transformVersion: string;
  startedAtIso: string;
  finishedAtIso: string;
  itemsScanned: number;
  itemsAccepted: number;
  itemsRejected: number;
  itemsDuplicated: number;
  reasonCounts?: readonly ImportSessionReasonCountV1[];
  errors?: readonly string[];
  rollbackRef: string;
}): ImportSessionBuildResult {
  if (
    !isNonEmpty(input.sessionId) ||
    !isNonEmpty(input.sourceKey) ||
    !isNonEmpty(input.transformVersion)
  ) {
    return { ok: false, reasonCode: "missing_field" };
  }
  if (!isNonEmpty(input.rollbackRef)) {
    return { ok: false, reasonCode: "missing_rollback_ref" };
  }
  const startedMs = Date.parse(input.startedAtIso);
  const finishedMs = Date.parse(input.finishedAtIso);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) {
    return { ok: false, reasonCode: "invalid_timestamp" };
  }
  if (finishedMs < startedMs) {
    return { ok: false, reasonCode: "finished_before_started" };
  }
  const counts = [
    input.itemsScanned,
    input.itemsAccepted,
    input.itemsRejected,
    input.itemsDuplicated,
  ];
  if (!counts.every(isCount)) {
    return { ok: false, reasonCode: "negative_count" };
  }
  // EXACT accounting: every scanned item is accepted, rejected or a
  // duplicate — an unaccounted item would be a silently dropped item.
  if (
    input.itemsAccepted + input.itemsRejected + input.itemsDuplicated !==
    input.itemsScanned
  ) {
    return { ok: false, reasonCode: "accounting_mismatch" };
  }
  const reasonCounts = input.reasonCounts ?? [];
  if (!reasonCounts.every((r) => isNonEmpty(r.code) && isCount(r.count))) {
    return { ok: false, reasonCode: "invalid_reason_count" };
  }
  const errors = input.errors ?? [];
  return {
    ok: true,
    session: {
      sessionId: input.sessionId,
      sourceKey: input.sourceKey,
      transformVersion: input.transformVersion,
      startedAtIso: input.startedAtIso,
      finishedAtIso: input.finishedAtIso,
      durationMs: finishedMs - startedMs,
      itemsScanned: input.itemsScanned,
      itemsAccepted: input.itemsAccepted,
      itemsRejected: input.itemsRejected,
      itemsDuplicated: input.itemsDuplicated,
      reasonCounts: [...reasonCounts],
      errors: errors.slice(0, IMPORT_SESSION_MAX_ERRORS),
      errorCount: errors.length,
      rollbackRef: input.rollbackRef,
    },
  };
}
