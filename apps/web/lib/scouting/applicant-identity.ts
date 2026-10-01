import "server-only";

import { AVATAR_BUCKET } from "@/lib/profile/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * WHO APPLIED - an application submitted TO this employer shows the applicant
 * to THAT employer (owner order 2026-10-01).
 *
 * WHO decides is the database, under the CALLER's own session:
 * `applicant_identity_v1(request, worker)` answers only to the owner of the
 * demand, only while the worker's application on it is not withdrawn, and
 * returns the display name and the photo PATH - nothing else. Zero rows for
 * every other caller. Only after that answer does the server sign that one
 * path for one hour (bucket stays private; contact details stay behind the
 * worker's own contact-disclosure answer).
 *
 * Until the function exists on the database (owner-gated migration) or on any
 * failure, this returns null and the caller keeps the anonymized handle - an
 * honest degradation, never a guessed name or a stand-in face.
 */

type ApplicantIdentityRpc = {
  rpc: (
    fn: "applicant_identity_v1",
    args: { p_request_id: string; p_worker_id: string },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export interface ApplicantIdentity {
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

export async function getApplicantIdentity(
  requestId: string,
  workerId: string,
): Promise<ApplicantIdentity | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as ApplicantIdentityRpc).rpc(
      "applicant_identity_v1",
      { p_request_id: requestId, p_worker_id: workerId },
    );
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as { display_name?: unknown; avatar_path?: unknown };
    const name = typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : null;
    const path = typeof row.avatar_path === "string" && row.avatar_path.length > 0 ? row.avatar_path : null;
    let avatarUrl: string | null = null;
    if (path) {
      const { data: signed } = await createAdminClient()
        .storage.from(AVATAR_BUCKET)
        .createSignedUrl(path, 60 * 60);
      avatarUrl = signed?.signedUrl ?? null;
    }
    if (!name && !avatarUrl) return null;
    return { name, avatarUrl };
  } catch {
    return null;
  }
}
