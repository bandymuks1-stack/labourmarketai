import { createClient } from "@/lib/supabase/client";

/**
 * Work-report photo upload (free tier: ONE photo per journal entry).
 *
 * Browser-side helper used by the journal composer AFTER the entry has been
 * saved. The blob goes straight to the private 'journal-entry-photos' bucket
 * (owner-scoped storage RLS), then the metadata row is registered through
 * the SECURITY DEFINER RPC, which re-checks ownership, MIME, size and the
 * server-enforced 1-photo free limit (migration 20260612091000).
 *
 * Honest degradation: when the storage bucket / RPC is not provisioned yet
 * the caller gets "not-ready" and shows the truthful "not available yet"
 * note — the entry itself stays saved either way.
 */

export const JOURNAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const JOURNAL_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
/** Free tier allows exactly one photo per entry (more = future VIP/Pro). */
export const JOURNAL_PHOTO_FREE_LIMIT = 1;

export type JournalPhotoUploadResult =
  | "uploaded"
  | "invalid"
  | "limit"
  | "not-ready"
  | "failed";

export function isValidJournalPhoto(file: File): boolean {
  return (
    (JOURNAL_PHOTO_MIME_TYPES as readonly string[]).includes(file.type) &&
    file.size > 0 &&
    file.size <= JOURNAL_PHOTO_MAX_BYTES
  );
}

export async function uploadJournalEntryPhoto(
  entryId: string,
  file: File,
): Promise<JournalPhotoUploadResult> {
  if (!isValidJournalPhoto(file)) return "invalid";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "failed";

  const photoId = crypto.randomUUID();
  const safeName =
    file.name.replace(/[^\w.\-]+/g, "_").slice(-100) || "photo.jpg";
  // Path contract pinned by the RPC + storage policies:
  //   <profile_id>/<entry_id>/<photo_id>/<filename>
  const path = `${user.id}/${entryId}/${photoId}/${safeName}`;

  const uploaded = await supabase.storage
    .from("journal-entry-photos")
    .upload(path, file, { contentType: file.type });
  if (uploaded.error) {
    const msg = uploaded.error.message?.toLowerCase() ?? "";
    if (msg.includes("bucket") && msg.includes("not")) return "not-ready";
    console.error("[journal-photo] storage upload failed:", uploaded.error);
    return "failed";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("register_journal_entry_photo", {
    p_photo_id: photoId,
    p_entry_id: entryId,
    p_file_name: safeName,
    p_mime_type: file.type,
    p_file_size: file.size,
    p_storage_path: path,
  });
  if (error) {
    // Best-effort cleanup so an unregistered blob doesn't linger.
    await supabase.storage.from("journal-entry-photos").remove([path]);
    if (error.code === "42883" || error.code === "42P01") return "not-ready";
    if (error.message?.includes("photo_limit_reached")) return "limit";
    console.error("[journal-photo] register RPC failed:", error);
    return "failed";
  }
  return "uploaded";
}
