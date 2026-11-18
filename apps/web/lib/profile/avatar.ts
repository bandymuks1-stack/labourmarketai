import { createAdminClient } from "@/lib/supabase/admin";
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
/** The one RPC this module calls outside the generated types (D1, 2026-09-30). */
type AvatarPathRpc = {
  rpc: (
    fn: "worker_avatar_path_v1",
    args: { p_worker_id: string },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * A worker's own photo, for someone who has a REAL work relationship with
 * that worker (owner decision D1, 2026-09-30).
 *
 * WHO decides is the database, under the VIEWER's own session:
 * `worker_avatar_path_v1` returns the photo's storage path only to the worker
 * or to a caller with an ACTIVE relationship — their company's roster, their
 * agency's roster, an active engagement in an organization they manage, or an
 * active assignment on a project they can manage. A profile that is merely
 * discoverable, or a manager role alone, gets no path. The path must lie in
 * the worker's own folder.
 *
 * Only after that answer does the server sign that ONE path for one hour. The
 * bucket stays private; no table, storage or RLS policy changes; nothing is
 * public. Any failure is `null` — the caller then shows the initials
 * monogram, never a stand-in face.
 */
export async function getAvatarForVisibleWorker(workerId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: path, error } = await (supabase as unknown as AvatarPathRpc).rpc(
      "worker_avatar_path_v1",
      { p_worker_id: workerId },
    );
    if (error || typeof path !== "string" || path.length === 0) return null;
    // The storage object stays private; the service key signs the one path
    // the database has just authorized for this viewer.
    const { data: signed } = await createAdminClient()
      .storage.from(AVATAR_BUCKET)
      .createSignedUrl(path, 60 * 60);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Sign ONE avatar path for one hour. The caller must already hold the
 * DATABASE's answer for that path (worker_avatar_path_v1, or
 * applicant_identity_v1 for an applicant to the caller's own need);
 * this never decides who may see a photo.
 */
export async function signAvatarPath(path: string): Promise<string | null> {
  try {
    const { data: signed } = await createAdminClient()
      .storage.from(AVATAR_BUCKET)
      .createSignedUrl(path, 60 * 60);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
}
