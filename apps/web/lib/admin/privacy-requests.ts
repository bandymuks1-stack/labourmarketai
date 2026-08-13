import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isPrivacyRequestPayload,
  PRIVACY_REQUEST_SOURCE,
} from "@/lib/privacy/privacy-request-model";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin privacy-request queue read (V8 W4-C item 2).
 *
 * The audit fact this fixes: export/deletion requests (customer_requests
 * rows stamped by submit_privacy_request_v1) surfaced to operators ONLY
 * inside the labour-demand matching workbench, mixed with hiring needs.
 * This read lists them as what they are — privacy requests — for the admin
 * control room's queue band.
 *
 * VISIBILITY ONLY. There is no processing action here and none is faked:
 * the deletion/export executor does not exist yet (SEC-06; design in
 * docs/legal/deletion-process-design-v1.md), so the section states plainly
 * that processing is manual.
 *
 * Authorization: ordinary user-scoped client — customer_requests RLS is
 * `profile_id = auth.uid() OR is_admin()`, and the host surface sits behind
 * requireSuperadmin. No admin client, read-only.
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const READ_LIMIT = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface PrivacyRequestQueueRow {
  readonly id: string;
  /** data_export | account_deletion | unknown (payload said privacy, type absent). */
  readonly type: string;
  readonly status: string;
  readonly createdAtIso: string;
  readonly profileId: string | null;
  /** Resolved via the profiles FK — admin RLS permits the read. */
  readonly email: string | null;
}

export type PrivacyRequestQueueResult =
  | { readonly kind: "ok"; readonly rows: readonly PrivacyRequestQueueRow[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

export async function listPrivacyRequestQueue(): Promise<PrivacyRequestQueueResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("customer_requests")
    .select("id, profile_id, status, created_at, payload, profiles(email)")
    .eq("payload->>source", PRIVACY_REQUEST_SOURCE)
    .order("created_at", { ascending: false })
    .limit(READ_LIMIT);
  if (error) {
    return error.code === RELATION_NOT_FOUND_CODE
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  type Row = {
    id: string;
    profile_id: string | null;
    status: string;
    created_at: string;
    payload: unknown;
    profiles: { email: string | null } | { email: string | null }[] | null;
  };
  const rows: PrivacyRequestQueueRow[] = ((data ?? []) as Row[])
    // Belt and braces: the SQL filter already matched the source marker; the
    // shared classifier re-checks so a payload shape change fails closed.
    .filter((r) => isPrivacyRequestPayload(r.payload))
    .map((r) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const type = (r.payload as Record<string, unknown>)
        ?.privacy_request_type;
      return {
        id: r.id,
        type: typeof type === "string" ? type : "unknown",
        status: r.status,
        createdAtIso: r.created_at,
        profileId: r.profile_id,
        email: prof?.email ?? null,
      };
    });
  return { kind: "ok", rows };
}
