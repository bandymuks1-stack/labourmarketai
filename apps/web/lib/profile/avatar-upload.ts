import { createClient } from "@/lib/supabase/client";
import { setProfileAvatarPath } from "@/lib/profile/avatar-actions";

/**
 * Client-side avatar upload (owner-scoped). Reuses the PR #484 compressor in the
 * UI before calling this. The blob goes to the private 'profile-avatars' bucket
 * under the caller's own folder (<profile_id>/avatar-<uuid>.<ext>), enforced by
 * owner-scoped storage RLS; then the path is recorded on profiles.avatar_url via
 * the server action. Honest degradation: "not-ready" when the bucket/column is
 * not provisioned yet — never a fake success.
 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarUploadResult = "uploaded" | "invalid" | "not-ready" | "failed";

export function isValidAvatar(file: File): boolean {
  return (
    (AVATAR_MIME_TYPES as readonly string[]).includes(file.type) &&
    file.size > 0 &&
    file.size <= AVATAR_MAX_BYTES
  );
}

export async function uploadProfileAvatar(file: File): Promise<AvatarUploadResult> {
  if (!isValidAvatar(file)) return "invalid";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "failed";

  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar-${crypto.randomUUID()}.${ext}`;

  const uploaded = await supabase.storage
    .from("profile-avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploaded.error) {
    const msg = uploaded.error.message?.toLowerCase() ?? "";
    if (msg.includes("bucket") && msg.includes("not")) return "not-ready";
    console.error("[avatar] storage upload failed:", uploaded.error);
    return "failed";
  }

  const res = await setProfileAvatarPath(path);
  if (!res.ok) {
    // Roll back the orphan blob; the column/RLS likely isn't provisioned yet.
    await supabase.storage.from("profile-avatars").remove([path]);
    return "not-ready";
  }
  return "uploaded";
}