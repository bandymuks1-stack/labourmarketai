import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  STAFF_REVIEW_AUTO_ENABLE,
  readStaffReviewNoticeOutcome,
  type ReviewNoticeSurface,
  type StaffReviewNoticeOutcome,
  REVIEW_NOTICE_VERSION,
} from "./auto-review-model";

/**
 * Work-review on acceptance (owner decision 1, 2026-10-12) — the executor.
 *
 * Runs in the PERSON's own session right after they accepted a staff
 * invitation on a surface that showed them the review sentence. ONE call to
 * the party-gated RPC `record_staff_review_notice_v1` (RED 20261012190000),
 * which in SQL:
 *   - finds the caller's OWN accepted acceptance row for that invitation
 *     (nobody can stamp somebody else's acceptance);
 *   - re-checks the invitation is a staff invitation of an organization and
 *     the relationship it created is that organization's active `employee`
 *     relationship of the caller (organization isolation);
 *   - refuses an acceptance older than a few minutes (the sentence must have
 *     accompanied the accept, never a later retrofit) and a second stamp;
 *   - stamps the acceptance row (version, surface, time) and writes an
 *     `audit_logs` row — the auditable acceptance fact;
 *   - only when asked to enable AND no manager ever chose for that
 *     relationship (`set_engagement_journal_review` audit rows), switches
 *     review on and audits that as automatic.
 * No direct write, no service role. Never throws: the acceptance already
 * happened and stays valid whatever this answers.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST202" || error.code === "42883"));
}

export async function recordStaffReviewNotice(input: {
  readonly invitationId: string | null;
  readonly surface: ReviewNoticeSurface;
  readonly notice: typeof REVIEW_NOTICE_VERSION | null;
}): Promise<StaffReviewNoticeOutcome> {
  if (!input.invitationId || input.notice !== REVIEW_NOTICE_VERSION) return "not_applicable";
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc("record_staff_review_notice_v1", {
      p_invitation_id: input.invitationId,
      p_notice_version: input.notice,
      p_surface: input.surface,
      p_enable_review: STAFF_REVIEW_AUTO_ENABLE,
    });
    if (error) return isMissingFunction(error) ? "not_enabled" : "error";
    return readStaffReviewNoticeOutcome(data);
  } catch {
    return "error";
  }
}
