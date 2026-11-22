import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The SIGNED-IN caller's own answer to an invitation link ("accepted",
 * "declined" or null), read from the same signed-in preview the invitation
 * page uses (get_invitation_preview_v2, v1 fallback). Null on any failure or
 * when nobody is signed in: an unread answer never grants a join.
 */
export async function readMyInvitationDecision(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    let { data, error } = await db.rpc("get_invitation_preview_v2", { p_token: token });
    if (error && (error.code === "42883" || error.code === "PGRST202")) {
      ({ data, error } = await db.rpc("get_invitation_preview_v1", { p_token: token }));
    }
    if (error || !data || typeof data !== "object") return null;
    const d = (data as { my_decision?: unknown }).my_decision;
    return typeof d === "string" ? d : null;
  } catch {
    return null;
  }
}
