import "server-only";

import { createHash } from "node:crypto";

import type { DomainCaller } from "@/lib/domain/caller";
import { untypedClient } from "./evidence-store";
import {
  EVIDENCE_MEDIA_BUCKET,
  EVIDENCE_MEDIA_MAX_BYTES,
  buildEvidenceMediaPath,
  resolveAnchors,
  resolveDateProvenance,
  sniffEvidenceMediaMime,
} from "./evidence-media-model";

/**
 * THE ONE WRITER of historical work photos (`organization_evidence_media`).
 *
 * Runs entirely under the CALLER's own session: the bucket's insert policy
 * admits only `org/<organization_id>/...` for a manager of that organization,
 * and the table's insert policy admits only a manager of the organization
 * with `imported_by_profile_id = auth.uid()`. The app layer narrows what is
 * offered; RLS decides.
 *
 *   1. validate the REAL bytes (size, signature -> mime) - declared types are
 *      never trusted; sha256 is computed server-side;
 *   2. require at least one STATED anchor (record / work object / person /
 *      organization) - nothing is inferred, no date-proximity matching;
 *   3. IDEMPOTENT: `unique (organization_id, content_sha256)` - the same bytes
 *      are one row; a re-import answers `duplicate` and writes nothing;
 *   4. upload to the content-addressed path, then insert the row;
 *   5. a failed insert removes the just-uploaded ORPHAN blob (the delete policy
 *      admits only unregistered objects, so a registered photo is never removed).
 *
 * UNKNOWN STAYS UNKNOWN: `original_taken_at` is stored only with the basis it
 * came from; otherwise null + `unknown`. `visibility` defaults to `private`.
 * Reported, not verified: there is no verification state to set.
 */

export type EvidenceMediaWriteInput = {
  readonly organizationId: string;
  readonly bytes: Uint8Array;
  readonly anchors: {
    evidenceRecordId?: unknown;
    workObjectId?: unknown;
    organizationPersonId?: unknown;
    organizationLevel?: unknown;
  };
  /** Where the photo came from (the importing system / archive). Required. */
  readonly sourceSystem: string;
  readonly sourceReference?: string | null;
  readonly originalFilename?: string | null;
  readonly originalTakenAt?: unknown;
  readonly takenAtBasis?: unknown;
  readonly caption?: string | null;
  readonly visibility?: "private" | "subject";
};

export type EvidenceMediaWriteResult =
  | { readonly ok: true; readonly outcome: "registered" | "duplicate"; readonly mediaId: string }
  | {
      readonly ok: false;
      readonly code:
        | "invalid"
        | "no_anchor"
        | "bad_date"
        | "unsupported_type"
        | "file_too_large"
        | "anchor_not_found"
        | "needs_migration"
        | "not_allowed"
        | "error";
    };

const MISSING = new Set(["42P01", "PGRST205"]);

function clip(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

export async function registerEvidenceMedia(
  caller: DomainCaller,
  input: EvidenceMediaWriteInput,
): Promise<EvidenceMediaWriteResult> {
  const sourceSystem = clip(input.sourceSystem, 80);
  if (!sourceSystem || !input.organizationId) return { ok: false, code: "invalid" };

  const anchors = resolveAnchors(input.anchors);
  if (!anchors) return { ok: false, code: "no_anchor" };

  const date = resolveDateProvenance(input.originalTakenAt, input.takenAtBasis);
  if (!date.ok) return { ok: false, code: "bad_date" };

  const { bytes } = input;
  if (bytes.byteLength === 0) return { ok: false, code: "invalid" };
  if (bytes.byteLength > EVIDENCE_MEDIA_MAX_BYTES) return { ok: false, code: "file_too_large" };
  const mime = sniffEvidenceMediaMime(bytes);
  if (!mime) return { ok: false, code: "unsupported_type" };

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = untypedClient(caller.supabase);

  // The anchored work object must belong to THIS organization (the table's
  // composite FKs enforce this for record and person; the work object FK is not
  // tenant-scoped, so it is checked here, under the caller's RLS).
  if (anchors.workObjectId) {
    const wo = await db
      .from("work_objects")
      .select("id, organization_id")
      .eq("id", anchors.workObjectId)
      .maybeSingle();
    if (wo.error) return { ok: false, code: "error" };
    if (!wo.data || wo.data.organization_id !== input.organizationId) {
      return { ok: false, code: "anchor_not_found" };
    }
  }

  // IDEMPOTENCY (read side): the same bytes are one row per organization.
  const existing = await db
    .from("organization_evidence_media")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("content_sha256", sha256)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, code: MISSING.has(existing.error.code ?? "") ? "needs_migration" : "error" };
  }
  if (existing.data?.id) return { ok: true, outcome: "duplicate", mediaId: existing.data.id as string };

  const path = buildEvidenceMediaPath(input.organizationId, sha256, mime);
  const uploaded = await caller.supabase.storage
    .from(EVIDENCE_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploaded.error) {
    const msg = (uploaded.error.message ?? "").toLowerCase();
    // A blob left by an earlier attempt that never got its row is the same
    // bytes at the same content-addressed path - register it.
    const alreadyThere = msg.includes("already exists") || msg.includes("duplicate");
    if (!alreadyThere) {
      if (msg.includes("bucket") && msg.includes("not")) return { ok: false, code: "needs_migration" };
      if (msg.includes("row-level security") || msg.includes("unauthorized")) {
        return { ok: false, code: "not_allowed" };
      }
      return { ok: false, code: "error" };
    }
  }

  const insert = await db
    .from("organization_evidence_media")
    .insert({
      organization_id: input.organizationId,
      evidence_record_id: anchors.evidenceRecordId,
      work_object_id: anchors.workObjectId,
      organization_person_id: anchors.organizationPersonId,
      organization_level: anchors.organizationLevel,
      storage_bucket: EVIDENCE_MEDIA_BUCKET,
      storage_path: path,
      mime_type: mime,
      byte_size: bytes.byteLength,
      content_sha256: sha256,
      caption: clip(input.caption, 1000),
      source_system: sourceSystem,
      source_reference: clip(input.sourceReference, 500),
      original_filename: clip(input.originalFilename, 300),
      original_taken_at: date.originalTakenAt,
      taken_at_basis: date.takenAtBasis,
      visibility: input.visibility === "subject" ? "subject" : "private",
      imported_by_profile_id: caller.userId,
    })
    .select("id")
    .single();

  if (insert.error || !insert.data?.id) {
    const code = insert.error?.code ?? "";
    // A concurrent writer won the unique(org, sha): its row is the one row.
    if (code === "23505") {
      const again = await db
        .from("organization_evidence_media")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("content_sha256", sha256)
        .maybeSingle();
      if (again.data?.id) return { ok: true, outcome: "duplicate", mediaId: again.data.id as string };
    }
    // ORPHAN: blob without a row. Best effort; the delete policy admits only
    // unregistered objects, so this can never remove a registered photo.
    await caller.supabase.storage.from(EVIDENCE_MEDIA_BUCKET).remove([path]);
    if (MISSING.has(code)) return { ok: false, code: "needs_migration" };
    if (code === "42501") return { ok: false, code: "not_allowed" };
    if (code === "23503" || code === "23514") return { ok: false, code: "anchor_not_found" };
    return { ok: false, code: "error" };
  }
  return { ok: true, outcome: "registered", mediaId: insert.data.id as string };
}
