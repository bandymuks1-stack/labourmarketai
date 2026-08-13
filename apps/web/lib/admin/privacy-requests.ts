import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSuperadmin } from "@/lib/auth/superadmin";
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

/**
 * Review verbs (V9 deletion executor, phase 1 — review only, NO deletion).
 *
 * The allowed TARGET statuses are the review subset of the table's own CHECK
 * vocabulary (0028): the two intake states (`draft`, `submitted`) are not
 * review outcomes. The user-side privacy page already carries labels for
 * exactly this set (privacySelfService.requests.status.*), so a transition
 * renders sensibly to the requester with zero copy changes.
 *
 * Mechanism = the matching workbench's existing admin write path, reused
 * verbatim in shape: ordinary authenticated UPDATE through the
 * `customer_requests_update` RLS policy (`is_admin()` leg, migration 0028;
 * the 20260705150000 transition trigger grants admins full pipeline
 * latitude), with the audit trail appended INTO the row's payload the same
 * way the workbench appends `match_log` — no new table, no RPC.
 *
 * Demand rows are untouchable twice over: the classifier refuses before the
 * write, and the UPDATE itself carries a SQL-side `payload->>source` filter,
 * so even a raced row swap cannot move a hiring need.
 */
export const PRIVACY_REVIEW_STATUSES = [
  "in_review",
  "needs_followup",
  "approved",
  "closed",
] as const;
export type PrivacyReviewStatus = (typeof PRIVACY_REVIEW_STATUSES)[number];

export const PRIVACY_REVIEW_NOTE_MAX = 500;

/** One appended audit entry — the workbench `match_log` pattern. */
interface PrivacyReviewLogEntry {
  readonly status_set: PrivacyReviewStatus;
  readonly note: string | null;
  readonly decided_by: string;
  readonly decided_at: string;
  readonly decided_via: "human";
}

function parseReviewLog(payload: Record<string, unknown>): PrivacyReviewLogEntry[] {
  const raw = payload.privacy_review_log;
  return Array.isArray(raw) ? (raw as PrivacyReviewLogEntry[]) : [];
}

export type PrivacyReviewResult =
  | { readonly kind: "ok" }
  | { readonly kind: "not-superadmin" }
  | { readonly kind: "invalid" }
  | { readonly kind: "not-found" }
  | { readonly kind: "not-privacy-request" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

export async function reviewPrivacyRequest(input: {
  requestId: string;
  status: string;
  note?: string | null;
}): Promise<PrivacyReviewResult> {
  if (
    !input.requestId.trim() ||
    !(PRIVACY_REVIEW_STATUSES as readonly string[]).includes(input.status)
  ) {
    return { kind: "invalid" };
  }
  const note =
    (input.note ?? "").trim().slice(0, PRIVACY_REVIEW_NOTE_MAX) || null;

  // Fail fast at the app layer; RLS remains the real gate underneath.
  if (!(await isSuperadmin())) return { kind: "not-superadmin" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-superadmin" };

  const { data: existing, error: readError } = await asAny(supabase)
    .from("customer_requests")
    .select("id, payload")
    .eq("id", input.requestId)
    .maybeSingle();
  if (readError) {
    return readError.code === RELATION_NOT_FOUND_CODE
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }
  if (!existing) return { kind: "not-found" };
  // NEGATIVE CONTROL: a demand row can never be reviewed through this verb.
  if (!isPrivacyRequestPayload(existing.payload)) {
    return { kind: "not-privacy-request" };
  }

  const payload =
    existing.payload && typeof existing.payload === "object"
      ? { ...(existing.payload as Record<string, unknown>) }
      : {};
  const entry: PrivacyReviewLogEntry = {
    status_set: input.status as PrivacyReviewStatus,
    note,
    decided_by: user.id,
    decided_at: new Date().toISOString(),
    decided_via: "human",
  };
  const nextPayload = {
    ...payload,
    privacy_review_log: [...parseReviewLog(payload), entry],
  };

  const { data: updated, error: updateError } = await asAny(supabase)
    .from("customer_requests")
    .update({
      status: input.status,
      manual_review_note: note,
      payload: nextPayload,
    })
    .eq("id", input.requestId)
    // SQL-side second lock: even a raced row swap cannot touch a demand row.
    .eq("payload->>source", PRIVACY_REQUEST_SOURCE)
    .select("id");
  if (updateError) return { kind: "error" };
  // RLS silently filters rows the caller may not update; the source filter
  // drops non-privacy rows — either way, 0 rows means nothing was reviewed.
  if (!updated || updated.length === 0) return { kind: "not-found" };
  return { kind: "ok" };
}

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
