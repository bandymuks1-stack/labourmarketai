/**
 * Conversation message attachments — pure model (user-journey repair v1).
 *
 * Shared by the client composer (pre-upload validation, previews) and the
 * server action (defense-in-depth re-validation before the register RPC,
 * which validates a third time inside Postgres). Pure functions only — no
 * supabase, no DOM — fully unit-testable.
 *
 * Mirrors the limits pinned in migration 20260712130000 (bucket allowlist,
 * 10 MB cap, 5 attachments per message, path convention
 * `<conversation_id>/<uploader_id>/<attachment_id>/<safe_name>`).
 */

export const CONVERSATION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX = 5;
export const CONVERSATION_ATTACHMENT_BUCKET = "conversation-attachments";

export const CONVERSATION_ATTACHMENT_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

export type ConversationAttachmentMime =
  (typeof CONVERSATION_ATTACHMENT_ALLOWED_MIME)[number];

export function isAllowedConversationAttachmentMime(
  mime: string,
): mime is ConversationAttachmentMime {
  return (CONVERSATION_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(mime);
}

/** Whether the attachment renders as an inline image in the thread. */
export function isImageAttachmentMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

/** Sanitized file name for the storage object key (same rules as the proven
 *  buyer uploader): ASCII-safe, bounded, never empty. The ORIGINAL name is
 *  kept in the metadata row for display. */
export function safeAttachmentFileName(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (trimmed.length === 0) return "file";
  return trimmed.slice(0, 200);
}

/** The upload descriptor the composer hands to the send action after the
 *  blob is already in the private bucket. */
export type ConversationAttachmentInput = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
};

export type AttachmentValidationError =
  | "bad_type"
  | "too_large"
  | "too_many"
  | "bad_path";

/** Build the canonical storage path for a new attachment blob. */
export function conversationAttachmentPath(args: {
  conversationId: string;
  uploaderId: string;
  attachmentId: string;
  fileName: string;
}): string {
  return `${args.conversationId}/${args.uploaderId}/${args.attachmentId}/${safeAttachmentFileName(args.fileName)}`;
}

/**
 * Validate a batch of attachment descriptors for one message send.
 * Returns null when valid, otherwise the first violation found.
 */
export function validateConversationAttachments(
  attachments: readonly ConversationAttachmentInput[],
  args: { conversationId: string; uploaderId: string },
): AttachmentValidationError | null {
  if (attachments.length > CONVERSATION_ATTACHMENTS_PER_MESSAGE_MAX) return "too_many";
  const expectedPrefix = `${args.conversationId}/${args.uploaderId}/`;
  for (const a of attachments) {
    if (!isAllowedConversationAttachmentMime(a.mimeType)) return "bad_type";
    if (
      !Number.isFinite(a.sizeBytes) ||
      a.sizeBytes <= 0 ||
      a.sizeBytes > CONVERSATION_ATTACHMENT_MAX_BYTES
    ) {
      return "too_large";
    }
    if (!a.storagePath.startsWith(expectedPrefix)) return "bad_path";
  }
  return null;
}

/**
 * The send-button contract: a message is sendable when it has non-empty
 * text OR at least one successfully uploaded attachment — and never while
 * an upload is still running or a failed upload sits unresolved in the
 * tray (silently dropping a failed file would be dishonest).
 */
export function canSendMessage(args: {
  bodyLength: number;
  uploadedCount: number;
  uploadingCount: number;
  failedCount: number;
}): boolean {
  if (args.uploadingCount > 0 || args.failedCount > 0) return false;
  return args.bodyLength > 0 || args.uploadedCount > 0;
}
