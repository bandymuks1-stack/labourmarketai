import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Buyer request attachments service (Stage 2 attachments PR 1).
 *
 * Backed by:
 *   - public.customer_request_attachments  (migration 0029)
 *   - public.register_customer_request_attachment RPC
 *   - storage bucket 'customer-request-attachments' (private)
 *
 * Level 1 — metadata only.
 *   The buyer uploads a file → we store the blob in the private
 *   bucket → we record one metadata row. We do NOT extract text,
 *   we do NOT call an OCR service, we do NOT call any AI provider.
 *   `analysis_status` defaults to 'not_started' and stays that way
 *   until a later PR wires a real extractor/analyser.
 *
 * Gracefully returns kind: "needs-migration" when the table or RPC
 * are absent (42P01 / 42883).
 *
 * Privacy / safety:
 *   - User-scoped supabase client only; RLS limits SELECT/UPDATE/
 *     DELETE to `profile_id = auth.uid() OR is_admin()`.
 *   - INSERT routes through the SECURITY DEFINER RPC which asserts
 *     ownership of the parent request and pins the storage_path to
 *     `<uid>/<request_id>/...`.
 *   - Signed read URLs are issued server-side with a 5-minute TTL.
 *     We never hand out public CDN URLs (the bucket is private).
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

export const ATTACHMENTS_BUCKET = "customer-request-attachments";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

export type AttachmentMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type AttachmentUploadStatus =
  | "uploading"
  | "uploaded"
  | "removed"
  | "failed";

export type AttachmentAnalysisStatus =
  | "not_started"
  | "extracted"
  | "needs_manual_review"
  | "structured"
  | "failed";

export interface CustomerRequestAttachmentRow {
  readonly id: string;
  readonly requestId: string;
  readonly profileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
  readonly uploadStatus: AttachmentUploadStatus;
  readonly analysisStatus: AttachmentAnalysisStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AttachmentsListResult =
  | { kind: "ok"; rows: readonly CustomerRequestAttachmentRow[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export interface RegisterAttachmentInput {
  readonly attachmentId: string;
  readonly requestId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
}

export type RegisterAttachmentResult =
  | { kind: "ok"; attachmentId: string }
  | { kind: "needs-migration" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

export type RemoveAttachmentResult =
  | { kind: "ok" }
  | { kind: "needs-migration" }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

function mapRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r: any,
): CustomerRequestAttachmentRow {
  return {
    id: r.id as string,
    requestId: r.request_id as string,
    profileId: r.profile_id as string,
    fileName: r.file_name as string,
    mimeType: r.mime_type as string,
    fileSizeBytes: Number(r.file_size_bytes ?? 0),
    storagePath: r.storage_path as string,
    uploadStatus: r.upload_status as AttachmentUploadStatus,
    analysisStatus: r.analysis_status as AttachmentAnalysisStatus,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function isAllowedMimeType(mime: string): mime is AttachmentMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export async function listAttachmentsForRequest(
  requestId: string,
): Promise<AttachmentsListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", rows: [] };
  const { data, error } = await asAny(supabase)
    .from("customer_request_attachments")
    .select(
      "id, request_id, profile_id, file_name, mime_type, file_size_bytes, storage_path, upload_status, analysis_status, created_at, updated_at",
    )
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => mapRow(r));
  return { kind: "ok", rows };
}

export async function listOwnAttachments(): Promise<AttachmentsListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", rows: [] };
  const { data, error } = await asAny(supabase)
    .from("customer_request_attachments")
    .select(
      "id, request_id, profile_id, file_name, mime_type, file_size_bytes, storage_path, upload_status, analysis_status, created_at, updated_at",
    )
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => mapRow(r));
  return { kind: "ok", rows };
}

export async function registerAttachment(
  input: RegisterAttachmentInput,
): Promise<RegisterAttachmentResult> {
  if (input.fileName.trim().length === 0 || input.fileName.length > 255) {
    return { kind: "invalid", message: "Invalid file_name" };
  }
  if (!isAllowedMimeType(input.mimeType.toLowerCase())) {
    return { kind: "invalid", message: "Unsupported mime_type" };
  }
  if (
    !Number.isFinite(input.fileSizeBytes) ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > ATTACHMENT_MAX_BYTES
  ) {
    return { kind: "invalid", message: "File size out of range" };
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "register_customer_request_attachment",
    {
      p_attachment_id: input.attachmentId,
      p_request_id: input.requestId,
      p_file_name: input.fileName,
      p_mime_type: input.mimeType.toLowerCase(),
      p_file_size: input.fileSizeBytes,
      p_storage_path: input.storagePath,
    },
  );
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", attachmentId: data as string };
}

export async function removeAttachment(
  attachmentId: string,
): Promise<RemoveAttachmentResult> {
  const supabase = await createClient();
  const { data: row, error: readError } = await asAny(supabase)
    .from("customer_request_attachments")
    .select("id, storage_path, profile_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (readError) {
    if (readError.code === RELATION_NOT_FOUND_CODE)
      return { kind: "needs-migration" };
    return { kind: "error", message: readError.message };
  }
  if (!row) return { kind: "not-found" };

  // Delete blob first; RLS limits this to objects under the caller's own
  // folder. If the storage delete fails (object already gone), we still
  // proceed to drop the metadata row.
  const { error: storageError } = await asAny(supabase).storage
    .from(ATTACHMENTS_BUCKET)
    .remove([row.storage_path as string]);
  if (storageError) {
    // Not fatal — log silently in the caller; metadata row removal is
    // still attempted.
  }

  const { error: deleteError } = await asAny(supabase)
    .from("customer_request_attachments")
    .delete()
    .eq("id", attachmentId);
  if (deleteError) {
    return { kind: "error", message: deleteError.message };
  }
  return { kind: "ok" };
}

export async function createSignedDownloadUrl(
  storagePath: string,
  ttlSeconds = 300,
): Promise<{ kind: "ok"; url: string } | { kind: "error"; message: string }> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    return { kind: "error", message: error?.message ?? "no signed url" };
  }
  return { kind: "ok", url: data.signedUrl as string };
}
