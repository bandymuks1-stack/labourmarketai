"use server";

import "server-only";

import { createHash } from "node:crypto";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  DOCUMENT_FILES_BUCKET,
  buildOrgDocumentFilePath,
  buildWorkerDocumentFilePath,
  isDocumentFileAbsentCode,
  isValidDocumentFileMime,
  nextDocumentFileVersion,
  noticeForDocumentRpcOutcome,
  DOCUMENT_FILE_MAX_BYTES,
  type DocumentEngineNotice,
} from "@/lib/documents/document-file-model";
import { emitDocumentAckNotification } from "@/lib/notifications/event-emitters";

/**
 * Document FILE write actions (Document & Evidence Engine v1).
 *
 * Upload flow (both scopes):
 *   1. validate MIME + the 5 MB cap on the REAL bytes (never the client's
 *      declared size), compute the sha256 server-side;
 *   2. upload the blob with the CALLER's OWN client — the storage insert
 *      policy admits only the canonical parent-scoped path prefix;
 *   3. register the version through the gated SECURITY DEFINER RPC
 *      `register_document_file_v1`, which re-checks authority, re-derives
 *      the monotonic version and re-verifies the path prefix;
 *   4. a failed registration removes the just-uploaded ORPHAN blob (the
 *      storage delete policy admits only unregistered objects).
 *
 * NATIVE-NAV forms: every action redirects back to the documents page with
 * an honest `?docNotice=` outcome. While the human-gated migration is not
 * applied the storage bucket / RPC is absent and the notice says
 * `needs_migration` — nothing pretends to have saved anything.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone — the only
 * notification is the durable in-app event store (its own gated table).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;

function readLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "lt");
  return LOCALE_RX.test(raw) ? raw : "lt";
}

function finish(locale: string, notice: DocumentEngineNotice): never {
  if (
    notice === "uploaded" ||
    notice === "acknowledged"
  ) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/documents?docNotice=${notice}`);
}

function noticeForRpcError(error: { code?: string }): DocumentEngineNotice {
  if (isDocumentFileAbsentCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_allowed";
  return "error";
}

type PreparedFile = {
  readonly bytes: Buffer;
  readonly mime: string;
  readonly sha256: string;
  readonly originalName: string;
};

/** Validate + materialise the uploaded file. Size is measured on the REAL
 *  buffer; the declared File.size is never trusted. */
async function prepareFile(
  formData: FormData,
): Promise<PreparedFile | DocumentEngineNotice> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "invalid";
  if (!isValidDocumentFileMime(file.type)) return "unsupported_type";
  // Cheap pre-check before buffering, then the authoritative buffer check.
  if (file.size > DOCUMENT_FILE_MAX_BYTES) return "file_too_large";
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) return "invalid";
  if (bytes.byteLength > DOCUMENT_FILE_MAX_BYTES) return "file_too_large";
  return {
    bytes,
    mime: file.type,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    originalName: file.name || "document.pdf",
  };
}

async function uploadAndRegister(opts: {
  supabase: SupabaseClient;
  scope: "worker" | "organization";
  parentId: string;
  path: string;
  prepared: PreparedFile;
}): Promise<DocumentEngineNotice> {
  const { supabase, scope, parentId, path, prepared } = opts;

  const uploaded = await supabase.storage
    .from(DOCUMENT_FILES_BUCKET)
    .upload(path, prepared.bytes, { contentType: prepared.mime });
  if (uploaded.error) {
    const msg = uploaded.error.message?.toLowerCase() ?? "";
    if (msg.includes("bucket") && msg.includes("not")) return "needs_migration";
    if (msg.includes("row-level security") || msg.includes("unauthorized")) {
      return "not_allowed";
    }
    console.error("[document-files] storage upload failed:", uploaded.error.message);
    return "error";
  }

  const { data, error } = await asAny(supabase).rpc(
    "register_document_file_v1",
    {
      p_scope: scope,
      p_parent_id: parentId,
      p_storage_path: path,
      p_original_filename: prepared.originalName.slice(-100),
      p_mime_type: prepared.mime,
      p_byte_size: prepared.bytes.byteLength,
      p_content_sha256: prepared.sha256,
    },
  );
  if (error || String(data ?? "") !== "registered") {
    // ORPHAN HANDLING: the blob exists but its version row does not —
    // remove it (best effort; the delete policy admits only unregistered
    // objects, so a registered file can never be removed this way).
    await supabase.storage.from(DOCUMENT_FILES_BUCKET).remove([path]);
    if (error) return noticeForRpcError(error);
    return noticeForDocumentRpcOutcome(String(data ?? ""), "registered", "uploaded");
  }
  return "uploaded";
}

/**
 * THE ONE worker-document file write (owner contract 2026-09-04 §5.5 — one
 * backbone): the documents page's slot action redirects with a notice; the
 * chat's action returns it. Both run this core — same checks, same canonical
 * path, same `register_document_file_v1`, same rollback of an unregistered
 * blob. Never a second upload path.
 */
async function uploadWorkerDocumentFileCore(formData: FormData): Promise<DocumentEngineNotice> {
  const workerDocumentId = String(formData.get("workerDocumentId") ?? "").trim();
  if (!UUID_RX.test(workerDocumentId)) return "invalid";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "not_allowed";

  const prepared = await prepareFile(formData);
  if (typeof prepared === "string") return prepared;

  // Own worker row (the RPC re-checks ownership server-side).
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const workerId = (worker?.id as string | undefined) ?? null;
  if (!workerId) return "not_allowed";

  // Existing versions (RLS-scoped) → the next monotonic version for the
  // canonical path. The RPC re-derives it and rejects a stale prefix.
  const filesRes = await asAny(supabase)
    .from("document_files")
    .select("version")
    .eq("worker_document_id", workerDocumentId)
    .limit(100);
  if (filesRes.error) {
    return isDocumentFileAbsentCode(filesRes.error.code) ? "needs_migration" : "error";
  }
  const version = nextDocumentFileVersion(
    (filesRes.data ?? []) as { version: number }[],
  );
  const path = buildWorkerDocumentFilePath(
    workerId,
    workerDocumentId,
    version,
    prepared.originalName,
  );

  return uploadAndRegister({
    supabase,
    scope: "worker",
    parentId: workerDocumentId,
    path,
    prepared,
  });
}

/** Upload (or replace with a NEW VERSION) the file of the caller's OWN
 *  worker document. Acks/verifications never carry over versions. The
 *  documents page's form contract: redirects with the notice. */
export async function uploadWorkerDocumentFileAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const notice = await uploadWorkerDocumentFileCore(formData);
  finish(locale, notice);
}

/** The chat's entry to the same write: the outcome comes back as a notice
 *  instead of a redirect, so the conversation can say what really happened. */
export async function uploadWorkerDocumentFileForChatAction(
  formData: FormData,
): Promise<{ notice: DocumentEngineNotice }> {
  const notice = await uploadWorkerDocumentFileCore(formData);
  if (notice === "uploaded") revalidatePath("/", "layout");
  return { notice };
}

/** Upload a new version onto an org register entry. The organization is
 *  resolved SERVER-SIDE from the active workspace — never from the form. */
export async function uploadOrgDocumentFileAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (!UUID_RX.test(orgDocumentId)) finish(locale, "invalid");

  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const supabase = await createClient();
  const prepared = await prepareFile(formData);
  if (typeof prepared === "string") finish(locale, prepared);

  // The register entry must belong to the ACTIVE organization (RLS-scoped
  // read; the RPC re-checks manager authority on top).
  const docRes = await asAny(supabase)
    .from("org_documents")
    .select("id, organization_id")
    .eq("id", orgDocumentId)
    .maybeSingle();
  if (docRes.error) {
    finish(
      locale,
      isDocumentFileAbsentCode(docRes.error.code) ? "needs_migration" : "error",
    );
  }
  if (!docRes.data || docRes.data.organization_id !== ctx.organizationId) {
    finish(locale, "not_found");
  }

  const filesRes = await asAny(supabase)
    .from("document_files")
    .select("version")
    .eq("org_document_id", orgDocumentId)
    .limit(100);
  if (filesRes.error) {
    finish(
      locale,
      isDocumentFileAbsentCode(filesRes.error.code) ? "needs_migration" : "error",
    );
  }
  const version = nextDocumentFileVersion(
    (filesRes.data ?? []) as { version: number }[],
  );
  const path = buildOrgDocumentFilePath(
    ctx.organizationId,
    orgDocumentId,
    version,
    prepared.originalName,
  );

  const notice = await uploadAndRegister({
    supabase,
    scope: "organization",
    parentId: orgDocumentId,
    path,
    prepared,
  });
  finish(locale, notice);
}

/** Acknowledge ONE assignment — assignee-only, fill-once, version-bound
 *  (all re-checked by acknowledge_document_v1). */
export async function acknowledgeDocumentAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const ackId = String(formData.get("ackId") ?? "").trim();
  if (!UUID_RX.test(ackId)) finish(locale, "invalid");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(locale, "not_allowed");

  const { data, error } = await asAny(supabase).rpc("acknowledge_document_v1", {
    p_acknowledgement_id: ackId,
  });
  if (error) finish(locale, noticeForRpcError(error));
  const outcome = String(data ?? "");
  if (outcome === "acknowledged") {
    // Durable fact for the ASSIGNER — after the domain write succeeded.
    // AWAITED, not detached: a `void`-detached insert is killable the instant
    // the serverless invocation returns. The emitter never throws.
    await emitDocumentAckNotification(ackId, "document_ack_completed");
  }
  finish(
    locale,
    noticeForDocumentRpcOutcome(outcome, "acknowledged", "acknowledged"),
  );
}
