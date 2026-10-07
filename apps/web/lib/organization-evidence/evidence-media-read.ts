import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import { untypedClient } from "./evidence-store";

/**
 * HISTORICAL WORK PHOTOS, BY THEIR STATED ANCHOR.
 *
 * Reads `organization_evidence_media` (migration
 * 20261007100000_evidence_record_media_link_v1) through the caller's OWN RLS
 * session - never the service role - so it returns exactly what the policies
 * admit: the supplying organization's managers, and the subject only once
 * linked AND only for rows marked visible to them. Private stays private.
 *
 * It returns METADATA ONLY. Serving bytes needs the separately gated storage
 * policy; nothing here builds a URL. A photo is never matched by date
 * proximity: `original_taken_at` is returned as stored and only the stated
 * anchor columns select rows.
 *
 * Used by nothing yet (scaffold; no UI).
 *
 *   ok            the rows, possibly EMPTY (a genuine "none recorded")
 *   unavailable   a failed read - NEVER rendered as an empty list
 *   unprovisioned the table does not exist in this environment (not applied)
 */
export type EvidenceMediaView = {
  readonly id: string;
  readonly organizationId: string;
  readonly evidenceRecordId: string | null;
  readonly workObjectId: string | null;
  readonly organizationPersonId: string | null;
  readonly organizationLevel: boolean;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly caption: string | null;
  readonly sourceSystem: string;
  readonly originalFilename: string | null;
  readonly originalTakenAt: string | null;
  readonly takenAtBasis: "exif" | "source_metadata" | "organization_stated" | "unknown";
  readonly importedAt: string;
  readonly visibility: "private" | "subject";
};

export type EvidenceMediaRead =
  | { readonly kind: "ok"; readonly media: readonly EvidenceMediaView[] }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unprovisioned" };

export type EvidenceMediaAnchor =
  | { readonly evidenceRecordId: string }
  | { readonly workObjectId: string }
  | { readonly organizationPersonId: string };

const LIMIT = 200;
const MISSING_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const COLUMNS =
  "id, organization_id, evidence_record_id, work_object_id, organization_person_id, organization_level, mime_type, byte_size, caption, source_system, original_filename, original_taken_at, taken_at_basis, imported_at, visibility";

type Row = {
  id: string;
  organization_id: string;
  evidence_record_id: string | null;
  work_object_id: string | null;
  organization_person_id: string | null;
  organization_level: boolean;
  mime_type: string;
  byte_size: number;
  caption: string | null;
  source_system: string;
  original_filename: string | null;
  original_taken_at: string | null;
  taken_at_basis: EvidenceMediaView["takenAtBasis"];
  imported_at: string;
  visibility: EvidenceMediaView["visibility"];
};

function toView(r: Row): EvidenceMediaView {
  return {
    id: r.id,
    organizationId: r.organization_id,
    evidenceRecordId: r.evidence_record_id,
    workObjectId: r.work_object_id,
    organizationPersonId: r.organization_person_id,
    organizationLevel: r.organization_level,
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    caption: r.caption,
    sourceSystem: r.source_system,
    originalFilename: r.original_filename,
    originalTakenAt: r.original_taken_at,
    takenAtBasis: r.taken_at_basis,
    importedAt: r.imported_at,
    visibility: r.visibility,
  };
}

/** Photos stated to belong to ONE anchor (record, work object or person). */
export async function readEvidenceMedia(
  caller: DomainCaller,
  anchor: EvidenceMediaAnchor,
): Promise<EvidenceMediaRead> {
  const [column, id] =
    "evidenceRecordId" in anchor
      ? (["evidence_record_id", anchor.evidenceRecordId] as const)
      : "workObjectId" in anchor
        ? (["work_object_id", anchor.workObjectId] as const)
        : (["organization_person_id", anchor.organizationPersonId] as const);

  const res = await untypedClient(caller.supabase)
    .from("organization_evidence_media")
    .select(COLUMNS)
    .eq(column, id)
    .order("original_taken_at", { ascending: true, nullsFirst: false })
    .limit(LIMIT);

  if (res.error) {
    return MISSING_CODES.has(res.error.code ?? "") ? { kind: "unprovisioned" } : { kind: "unavailable" };
  }
  return { kind: "ok", media: ((res.data ?? []) as Row[]).map(toView) };
}
