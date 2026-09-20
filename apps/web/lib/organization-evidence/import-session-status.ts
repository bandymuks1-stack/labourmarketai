/**
 * THE STATUS OF AN IMPORT SESSION, derived — never stored.
 *
 * `evidence_import_sessions` is IMMUTABLE by design (no UPDATE policy): what
 * happened to a session is the append-only trail in `evidence_import_events`.
 * A "your imports" list therefore reads the trail and says, per session, the
 * one word the newest decisive event supports. PURE: no IO, no clock.
 *
 *   committed   the newest decisive event is `committed` or `reinstated`
 *   withdrawn   … is `rolled_back` (nothing deleted; every record carries
 *               its withdrawal note and stays readable in the door)
 *   failed      … is `failed`
 *   staged      no decisive event yet: created / rows submitted / previewed —
 *               a source read but not yet recorded (the honest default)
 */

export type ImportSessionStatus = "staged" | "committed" | "withdrawn" | "failed";

export interface ImportSessionEvent {
  readonly eventType: string;
  /** ISO timestamp; a null orders last (oldest) — an undated event decides nothing. */
  readonly createdAt: string | null;
}

const DECISIVE: Readonly<Record<string, ImportSessionStatus>> = {
  committed: "committed",
  reinstated: "committed",
  rolled_back: "withdrawn",
  failed: "failed",
};

export function deriveImportSessionStatus(
  events: readonly ImportSessionEvent[],
): ImportSessionStatus {
  let newest: { at: string; status: ImportSessionStatus } | null = null;
  for (const e of events) {
    const status = DECISIVE[e.eventType];
    if (!status || !e.createdAt) continue;
    if (!newest || e.createdAt > newest.at) newest = { at: e.createdAt, status };
  }
  return newest?.status ?? "staged";
}
