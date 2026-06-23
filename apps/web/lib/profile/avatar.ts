import { createClient } from "@/lib/supabase/server";

/**
 * Read the signed-in user's OWN avatar for display (server-only). The bucket is
 * private, so we mint a short-lived signed URL. Degrades honestly to null when
 * the migration isn't applied yet or no avatar is set — the UI then renders the
 * initials monogram, never a fake/placeholder face.
 */
export const AVATAR_BUCKET = "profile-avatars";

export async function getOwnAvatar(): Promise<{
  path: string | null;
  signedUrl: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { path: null, signedUrl: null };

  let path: string | null = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single();
    if (error) return { path: null, signedUrl: null }; // column not provisioned
    path = data?.avatar_url ?? null;
  } catch {
    return { path: null, signedUrl: null };
  }
  if (!path) return { path: null, signedUrl: null };

  const { data: signed } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return { path, signedUrl: signed?.signedUrl ?? null };
}