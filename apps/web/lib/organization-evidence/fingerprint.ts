import { createHash } from "node:crypto";

import { normalizeLabel } from "@/lib/timesheet-import/resolve-entities";
import type { SourceWorkRow } from "@/lib/work-history/source-rows";

/**
 * IDEMPOTENCY - the two fingerprints that make re-importing the same history
 * a no-op instead of a duplicate.
 *
 * Pure and deterministic: the same input produces the same digest in the web
 * UI, in an authorized agent's call, and in a test. That is the whole point -
 * a company that uploads Monday's file again on Friday, and an assistant that
 * retries a timed-out submit, must both land on the SAME rows.
 *
 *   sourceFingerprint  identifies the SOURCE (a file's bytes, or an agent's
 *                      canonical payload). Unique per organization on
 *                      `work_history_import_sessions`, so re-uploading a file
 *                      resolves to the session that already exists.
 *
 *   recordFingerprint  identifies one FACT (this person, this date/period,
 *                      these hours, this object, this description). Unique per
 *                      organization on `work_history_records`, so the same
 *                      fact arriving from two different files is stored once.
 *
 * WHAT THE RECORD FINGERPRINT DELIBERATELY IGNORES: the file it came from and
 * the row number. A fact is the same fact whichever spreadsheet carries it.
 *
 * WHAT IT DELIBERATELY INCLUDES: the description. Two 8-hour days on the same
 * object are genuinely two records when the work differs, and collapsing them
 * would silently delete half a person's history. Rows identical in every
 * respect INCLUDING the text are the same record - that is the honest reading
 * of a re-upload, and the preview still shows it as a duplicate rather than
 * discarding it quietly.
 */

const HASH = "sha256";

function sha256Hex(input: string): string {
  return createHash(HASH).update(input, "utf8").digest("hex");
}

/** Fingerprint of raw source bytes - a file. */
export function fingerprintBytes(bytes: Uint8Array): string {
  return createHash(HASH).update(bytes).digest("hex");
}

/** Stable JSON: object keys sorted at every depth, so two structurally equal
 *  payloads hash identically regardless of key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value === undefined ? null : value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Fingerprint of a structured payload - an agent submission, an ERP export.
 *  `label` separates namespaces so a CSV and an API payload with identical
 *  content still fingerprint differently when the caller says they differ. */
export function fingerprintPayload(label: string, payload: unknown): string {
  return sha256Hex(`work-history-source:v1:${label}:${canonicalJson(payload)}`);
}

/** Numbers normalise to two decimals so "8", "8.0" and "8.00" are one value. */
function hoursKey(hours: number | null | undefined): string {
  return hours == null ? "" : (Math.round(hours * 100) / 100).toFixed(2);
}

/**
 * Fingerprint of ONE historical fact, within one organization.
 *
 * The person key is the RESOLVED roster person id when the row matched one,
 * and the normalised written name otherwise - so a row imported before the
 * person existed and the same row imported after they were created still
 * collide, which is exactly what a company re-running an import expects.
 */
export function recordFingerprint(input: {
  readonly organizationId: string;
  readonly organizationPersonId: string | null;
  readonly personLabel: string;
  readonly workObjectId: string | null;
  readonly projectLabel: string | null;
  readonly workDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
  readonly workText: string;
}): string {
  const person = input.organizationPersonId ?? `name:${normalizeLabel(input.personLabel)}`;
  const place =
    input.workObjectId ?? (input.projectLabel ? `label:${normalizeLabel(input.projectLabel)}` : "");
  const parts = [
    input.organizationId,
    person,
    place,
    input.workDate ?? "",
    input.periodStart ?? "",
    input.periodEnd ?? "",
    hoursKey(input.hours),
    normalizeLabel(input.workText),
  ];
  return sha256Hex(`work-history-record:v1:${parts.join("|")}`);
}

/** Convenience over a parsed source row (before or after entity resolution). */
export function recordFingerprintForRow(
  organizationId: string,
  row: SourceWorkRow,
  resolved?: { organizationPersonId?: string | null; workObjectId?: string | null },
): string {
  return recordFingerprint({
    organizationId,
    organizationPersonId: resolved?.organizationPersonId ?? null,
    personLabel: row.personLabel,
    workObjectId: resolved?.workObjectId ?? null,
    projectLabel: row.projectLabel ?? null,
    workDate: row.workDate ?? null,
    periodStart: row.periodStart ?? null,
    periodEnd: row.periodEnd ?? null,
    hours: row.hours ?? null,
    workText: row.workText,
  });
}

/**
 * The per-session tamper-evidence chain (doctrine 3.3). Committed records are
 * chained in row order within their import session, so altering one historical
 * row after the fact breaks every link after it.
 *
 * Chained per SESSION rather than per organization on purpose: a session's
 * rows are written by one atomic statement in a known order, so the chain is
 * reproducible. A global chain would depend on concurrent insert order and
 * could not be recomputed from the data.
 */
export function chainHash(
  prev: string | null,
  recordFingerprintValue: string,
  importedAtIso: string,
): string {
  return sha256Hex(
    `work-history-chain:v1:${prev ?? ""}:${recordFingerprintValue}:${importedAtIso}`,
  );
}
