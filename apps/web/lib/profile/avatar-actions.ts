"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile avatar server actions (owner-scoped, owner-RLS only — no SECURITY
 * DEFINER). The user's avatar PATH is written to profiles.avatar_url via the
 * existing profiles owner-UPDATE policy (id = auth.uid()). The column exists
 * after migration 20260623200000 is applied; before that, the update fails
 * gracefully and the UI shows an honest "not ready" state.
 */
export async function setProfileAvatarPath(path: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const clean = (path ?? "").trim();
  // Defence-in-depth: the path must live under the caller's own folder.
  if (!clean.startsWith(`${user.id}/`) || clean.length > 1024) return { ok: false };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: clean })
    .eq("id", user.id);
  if (error) {
    console.error("[avatar] set path failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeProfileAvatar(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: prof } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  const path: string | null = prof?.avatar_url ?? null;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) {
    console.error("[avatar] clear failed:", error.message);
    return { ok: false };
  }
  if (path && path.startsWith(`${user.id}/`)) {
    // Best-effort delete of the stored object (owner-scoped storage RLS).
    await supabase.storage.from("profile-avatars").remove([path]);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}