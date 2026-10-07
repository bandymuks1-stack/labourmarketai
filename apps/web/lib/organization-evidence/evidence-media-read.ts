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
 * It returns METADATA ONLY; bytes are served by `evidence-media-serve.ts`
 * (short-lived signed URLs, again under the caller's own session - the private
 * `evidence-media` bucket's read policy delegates to this table's RLS, and
 * exists only once migration 20261007180000 is applied). A photo is never
 * matched by date proximity: `original_taken_at` is returned as stored and
 * only the stated anchor columns select rows.
 *
 * Used by `components/app/evidence-media-strip.tsx`.
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
  | { readonly workObjectIds: readonly string[] }
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
  if ("workObjectIds" in anchor && anchor.workObjectIds.length === 0) {
    // A project with no work objects has no stated media anchor: honest empty.
    return { kind: "ok", media: [] };
  }
  const base = untypedClient(caller.supabase).from("organization_evidence_media").select(COLUMNS);
  const filtered =
    "workObjectIds" in anchor
      ? base.in("work_object_id", [...anchor.workObjectIds])
      : "evidenceRecordId" in anchor
        ? base.eq("evidence_record_id", anchor.evidenceRecordId)
        : "workObjectId" in anchor
          ? base.eq("work_object_id", anchor.workObjectId)
          : base.eq("organization_person_id", anchor.organizationPersonId);

  const res = await filtered
    .order("original_taken_at", { ascending: true, nullsFirst: false })
    .limit(LIMIT);

  if (res.error) {
    return MISSING_CODES.has(res.error.code ?? "") ? { kind: "unprovisioned" } : { kind: "unavailable" };
  }
  return { kind: "ok", media: ((res.data ?? []) as Row[]).map(toView) };
}

const MAX_PROJECT_OBJECTS = 200;

/**
 * Photos stated against ANY work object (= project place) of one project.
 * Resolves the project's work objects through the caller's own RLS, then reads
 * only rows whose `work_object_id` is one of them - never by date proximity.
 */
export async function readEvidenceMediaForProject(
  caller: DomainCaller,
  projectId: string,
): Promise<EvidenceMediaRead> {
  const objs = await untypedClient(caller.supabase)
    .from("work_objects")
    .select("id")
    .eq("project_id", projectId)
    .limit(MAX_PROJECT_OBJECTS);
  if (objs.error) {
    return MISSING_CODES.has(objs.error.code ?? "") ? { kind: "unprovisioned" } : { kind: "unavailable" };
  }
  const ids = ((objs.data ?? []) as { id: string }[]).map((o) => o.id);
  return readEvidenceMedia(caller, { workObjectIds: ids });
}
