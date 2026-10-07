import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { untypedClient } from "./evidence-store";
import { listEvidenceRecords, type EvidenceRecordView } from "./import-core";

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
 */
export type WorkObjectEvidenceRead =
  | { readonly kind: "ok"; readonly records: readonly EvidenceRecordView[] }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unprovisioned" };

const LIMIT = 200;
const MAX_WORK_OBJECTS = 200;
const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

export async function readEvidenceForWorkObject(
  caller: DomainCaller,
  workObjectIds: string | readonly string[],
): Promise<WorkObjectEvidenceRead> {
  const ids = typeof workObjectIds === "string" ? [workObjectIds] : [...workObjectIds];
  if (ids.length === 0) return { kind: "ok", records: [] };
  const res = await listEvidenceRecords(caller, { workObjectIds: ids, limit: LIMIT });
  if (res.kind === "needs-migration") return { kind: "unprovisioned" };
  if (res.kind !== "ok") return { kind: "unavailable" };
  return { kind: "ok", records: res.records.filter((r) => !r.withdrawn) };
}

/** A project's records: its work objects (RLS-scoped) → their evidence. */
export async function readEvidenceForProject(
  caller: DomainCaller,
  projectId: string,
): Promise<WorkObjectEvidenceRead> {
  const objs = await untypedClient(caller.supabase)
    .from("work_objects")
    .select("id")
    .eq("project_id", projectId)
    .limit(MAX_WORK_OBJECTS);
  if (objs.error) {
    return MISSING_OBJECT_CODES.has(objs.error.code ?? "")
      ? { kind: "unprovisioned" }
      : { kind: "unavailable" };
  }
  const ids = ((objs.data ?? []) as { id: string }[]).map((o) => o.id);
  return readEvidenceForWorkObject(caller, ids);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A person's name for display, or null — a raw technical id is never a name. */
export function displayPersonName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n || UUID.test(n)) return null;
  return n;
}
