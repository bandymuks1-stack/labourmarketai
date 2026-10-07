import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { untypedClient } from "./evidence-store";
import { listAllEvidenceRecords, readAllPages } from "./evidence-pagination";
import type { EvidenceRecordView } from "./import-core";

/**
 * HISTORICAL WORK ON A PLACE / PROJECT.
 *
 * Imports stamp `organization_evidence_records.work_object_id` (and a
 * `context_label`), but nothing read the records back by work object, so a
 * project page showed none of the history the organization had imported for
 * it. This is that reader. It composes the ONE evidence read
 * (`listEvidenceRecords`) through the caller's OWN RLS session — never the
 * service role — so it shows exactly what the manager reads already show.
 *
 *   ok           the live records, possibly EMPTY (a genuine "none recorded")
 *   unavailable  a failed read — NEVER rendered as an empty list
 *   unprovisioned the evidence store does not exist in this environment
 *
 * Withdrawn records are excluded (they stay readable on the history door).
 *
 * EVERY RECORD, NOT THE FIRST 200. A project holds hundreds of records (593 in
 * production), so a bare `limit(200)` cut the history silently. The read pages
 * to the end (`listAllEvidenceRecords`); only the safety ceiling can still
 * truncate, and then `truncated: true` MUST be disclosed by the caller.
 */
export type WorkObjectEvidenceRead =
  | {
      readonly kind: "ok";
      readonly records: readonly EvidenceRecordView[];
      /** The safety ceiling was reached: more records exist than were read. */
      readonly truncated: boolean;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unprovisioned" };

const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

export async function readEvidenceForWorkObject(
  caller: DomainCaller,
  workObjectIds: string | readonly string[],
): Promise<WorkObjectEvidenceRead> {
  const ids = typeof workObjectIds === "string" ? [workObjectIds] : [...workObjectIds];
  if (ids.length === 0) return { kind: "ok", records: [], truncated: false };
  const res = await listAllEvidenceRecords(caller, { workObjectIds: ids });
  if (res.kind === "needs-migration") return { kind: "unprovisioned" };
  if (res.kind !== "ok") return { kind: "unavailable" };
  return { kind: "ok", records: res.records.filter((r) => !r.withdrawn), truncated: res.truncated };
}

/** A project's records: its work objects (RLS-scoped) → their evidence. */
export async function readEvidenceForProject(
  caller: DomainCaller,
  projectId: string,
): Promise<WorkObjectEvidenceRead> {
  let failureCode = "";
  const objs = await readAllPages<{ id: string }>(async (from, to) => {
    const res = await untypedClient(caller.supabase)
      .from("work_objects")
      .select("id")
      .eq("project_id", projectId)
      .order("id", { ascending: true })
      .range(from, to);
    if (res.error) failureCode = res.error.code ?? "";
    return { data: (res.data ?? null) as { id: string }[] | null, error: res.error };
  });
  if (!objs) {
    return MISSING_OBJECT_CODES.has(failureCode) ? { kind: "unprovisioned" } : { kind: "unavailable" };
  }
  const res = await readEvidenceForWorkObject(
    caller,
    objs.rows.map((o) => o.id),
  );
  // A truncated work-object list is the same statement as truncated records.
  return res.kind === "ok" && objs.truncated ? { ...res, truncated: true } : res;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A person's name for display, or null — a raw technical id is never a name. */
export function displayPersonName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n || UUID.test(n)) return null;
  return n;
}
