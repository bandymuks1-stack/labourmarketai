import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Internal follow-up task queue — read service (product-tree branch 24,
 * train §8.13).
 *
 * Reads ONLY the new follow_up_tasks table (migration 20260705235000) for
 * the operator queue on the EXISTING admin control room. RLS is ADMIN-ONLY
 * (is_admin()): a non-admin session reads zero rows, and the caller (the
 * admin dashboard page) is additionally gated by requireSuperadmin.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere — no email, no
 * SMS, no push, no Telegram, no webhook, no outbound fetch. It is an
 * operator memory of next actions inside the product.
 *
 * Honest degradation: while the owner-gated migration is not applied, the
 * read sees 42P01 (relation missing) and reports { applied: false } — the
 * control room then shows the queue's "not yet available" state and no
 * task data is faked.
 *
 * Privacy: subject columns are ids only (no copied name/email/phone) and
 * this module never selects the author column — no operator identity
 * leaves the read service.
 */

import {
  FOLLOW_UP_STATUSES,
  type FollowUpQueueData,
  type FollowUpStatus,
  type FollowUpTask,
} from "@/lib/followup/follow-up-tasks-model";

export {
  FOLLOW_UP_STATUSES,
  type FollowUpQueueData,
  type FollowUpStatus,
  type FollowUpTask,
} from "@/lib/followup/follow-up-tasks-model";

const RELATION_NOT_FOUND_CODE = "42P01";
const UNDEFINED_COLUMN_CODE = "42703";

const SELECT_COLUMNS =
  "id, subject_profile_id, subject_company_id, note, status, created_at, resolved_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type Row = {
  id: string;
  subject_profile_id: string | null;
  subject_company_id: string | null;
  note: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

function toTask(r: Row): FollowUpTask | null {
  if (!(FOLLOW_UP_STATUSES as readonly string[]).includes(r.status)) {
    return null;
  }
  return {
    id: r.id,
    subjectProfileId: r.subject_profile_id ?? null,
    subjectCompanyId: r.subject_company_id ?? null,
    note: r.note,
    status: r.status as FollowUpStatus,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? null,
  };
}

/**
 * Operator queue read model: pending tasks (oldest first — a queue) plus the
 * most recently resolved ones. Real rows only; RLS scopes everything to
 * admin sessions.
 */
export async function getFollowUpQueue(): Promise<FollowUpQueueData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const pendingRes = await asAny(supabase)
    .from("follow_up_tasks")
    .select(SELECT_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (pendingRes.error) {
    if (
      pendingRes.error.code === RELATION_NOT_FOUND_CODE ||
      pendingRes.error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { applied: false };
    }
    return {
      applied: true,
      pending: [],
      resolved: [],
      error: pendingRes.error.message,
    };
  }

  const resolvedRes = await asAny(supabase)
    .from("follow_up_tasks")
    .select(SELECT_COLUMNS)
    .in("status", ["done", "dismissed"])
    .order("resolved_at", { ascending: false })
    .limit(20);

  const pending = ((pendingRes.data ?? []) as Row[])
    .map(toTask)
    .filter((t): t is FollowUpTask => t !== null);
  const resolved = ((resolvedRes.error ? [] : resolvedRes.data ?? []) as Row[])
    .map(toTask)
    .filter((t): t is FollowUpTask => t !== null);

  return { applied: true, pending, resolved, error: null };
}
