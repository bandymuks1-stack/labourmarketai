import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CONVERSATION_ATTACHMENT_BUCKET } from "@/lib/communication/attachment-model";

/**
 * Conversation message attachments — server read layer (user-journey
 * repair v1). Mirrors the buyer customer-request-attachments service:
 * RLS-scoped metadata reads + short-lived signed URLs from the PRIVATE
 * bucket. No public URLs, no service_role, graceful degradation while the
 * owner-gated migration 20260712130000 is not applied.
 */

export type ConversationMessageAttachment = {
  id: string;
  conversationId: string;
  messageId: string;
  uploaderId: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  createdAt: string;
  /** Short-lived signed download URL (5 min) or null when minting failed. */
  signedUrl: string | null;
};

export type ConversationAttachmentsRead =
  | { status: "ok"; byMessage: Map<string, ConversationMessageAttachment[]> }
  | { status: "needs-migration" }
  | { status: "error" };

// Generated DB types don't include the draft table yet (regenerated after
// the owner applies the migration). RLS still enforces access at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

/** Read every attachment of a conversation (RLS: participants only) and
 *  mint a signed URL per blob. One query + N sign calls, bounded by the
 *  thread page's own message limit. */
export async function listConversationAttachments(
  conversationId: string,
): Promise<ConversationAttachmentsRead> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("conversation_message_attachments")
    .select(
      "id, conversation_id, message_id, uploader_id, file_name, mime_type, file_size_bytes, storage_path, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    // 42P01 = relation missing → the draft migration is not applied yet.
    if (error.code === "42P01" || /conversation_message_attachments/.test(error.message ?? "")) {
      return { status: "needs-migration" };
    }
    console.error("[communication] attachment read failed:", error.code ?? "unknown");
    return { status: "error" };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    conversation_id: string;
    message_id: string;
    uploader_id: string;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    storage_path: string;
    created_at: string;
  }>;

  const byMessage = new Map<string, ConversationMessageAttachment[]>();
  for (const row of rows) {
    // Signed URL minted through the USER-scoped client — storage RLS
    // re-checks participant access; a revoked participant gets nothing.
    const { data: signed } = await supabase.storage
      .from(CONVERSATION_ATTACHMENT_BUCKET)
      .createSignedUrl(row.storage_path, 300);
    const item: ConversationMessageAttachment = {
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      uploaderId: row.uploader_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      storagePath: row.storage_path,
      createdAt: row.created_at,
      signedUrl: signed?.signedUrl ?? null,
    };
    const list = byMessage.get(row.message_id);
    if (list) list.push(item);
    else byMessage.set(row.message_id, [item]);
  }
  return { status: "ok", byMessage };
}
