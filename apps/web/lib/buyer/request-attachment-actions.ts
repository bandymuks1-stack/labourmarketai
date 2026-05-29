"use server";

import { revalidatePath } from "next/cache";

import {
  registerAttachment,
  removeAttachment,
  ATTACHMENT_MAX_BYTES,
  isAllowedMimeType,
} from "./customer-request-attachments";

export type RecordAttachmentActionResult =
  | { ok: true; attachmentId: string }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "error";
      message?: string;
    };

export interface RecordAttachmentInputDto {
  readonly attachmentId: string;
  readonly requestId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly storagePath: string;
}

export async function recordCustomerRequestAttachmentAction(
  input: RecordAttachmentInputDto,
): Promise<RecordAttachmentActionResult> {
  if (!input.attachmentId || !input.requestId) {
    return { ok: false, code: "invalid", message: "Missing identifiers" };
  }
  if (
    typeof input.fileSizeBytes !== "number" ||
    input.fileSizeBytes <= 0 ||
    input.fileSizeBytes > ATTACHMENT_MAX_BYTES
  ) {
    return { ok: false, code: "invalid", message: "File size out of range" };
  }
  if (!isAllowedMimeType(input.mimeType.toLowerCase())) {
    return { ok: false, code: "invalid", message: "Unsupported mime_type" };
  }

  const r = await registerAttachment({
    attachmentId: input.attachmentId,
    requestId: input.requestId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    storagePath: input.storagePath,
  });

  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "invalid") return { ok: false, code: "invalid", message: r.message };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, attachmentId: r.attachmentId };
}

export type RemoveAttachmentActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "not_found" | "error";
      message?: string;
    };

export async function removeCustomerRequestAttachmentAction(
  attachmentId: string,
): Promise<RemoveAttachmentActionResult> {
  if (!attachmentId) {
    return { ok: false, code: "error", message: "Missing attachment id" };
  }
  const r = await removeAttachment(attachmentId);
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "not-found") return { ok: false, code: "not_found" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
