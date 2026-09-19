import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Booked people — the GREEN half of R-2 (2026-09-19 completion audit).
 *
 * A direct booking mints a `company_worker_engagements` row; the journal
 * review gate reads `engagement_contexts`; nothing bridges them. Until the
 * owner approves the RED half (provisioning a context inside the booking
 * RPC), a booked worker is INVISIBLE on the employer's people page and the
 * employer has no honest answer to "why can't I see their journal?".
 *
 * This read makes the relationship visible where the employer manages
 * people, and names the ONE path that already exists in authority terms:
 * the employee invitation. `accept_invitation_apply_v2` /
 * `accept_company_worker_invitation` provision the `employee` engagement
 * context the moment the WORKER accepts — never before, never by the
 * employer alone.
 *
 * Read-only. RLS-scoped (`company_worker_engagements_select`): the employer
 * only ever sees rows of the company it owns. No authority is widened.
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const UNDEFINED_COLUMN_CODE = "42703";
const ABSENT = new Set([RELATION_NOT_FOUND_CODE, UNDEFINED_COLUMN_CODE]);

/** Bounded read — a company's active bookings are never streamed unbounded. */
export const BOOKED_PEOPLE_LIMIT = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface BookedPerson {
  readonly engagementId: string;
  readonly workerId: string;
  readonly profileId: string;
  /** The stored name, as far as the viewer may truthfully read it. */
  readonly name: string | null;
  readonly startedAt: string;
  /**
   * Whether the person ALREADY holds an active organization membership
   * (an `engagement_contexts` row with this organization). When true their
   * journal is governed by the members panel; when false it cannot be
   * reviewed by this organization at all — the honest state this surface
   * exists to name.
   */
  readonly isMember: boolean;
}

export type BookedPeopleResult =
  | { kind: "ok"; rows: readonly BookedPerson[] }
  | { kind: "needs-migration" }
  /** Read failed. NEVER rendered as "nobody is booked". */
  | { kind: "error"; message: string };

/**
 * Active booking engagements of ONE company, excluding people who are
 * already on the roster (`excludeWorkerIds` — those are listed by the
 * roster section) and marking those who already hold an organization
 * membership (`memberProfileIds` — those are governed by the members panel).
 */
export async function listBookedPeople(
  companyId: string,
  opts: {
    readonly excludeWorkerIds: ReadonlySet<string>;
    readonly memberProfileIds: ReadonlySet<string>;
  },
): Promise<BookedPeopleResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("company_worker_engagements")
    .select("id, status, started_at, worker_id, workers(profile_id, display_name)")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(BOOKED_PEOPLE_LIMIT);

  if (error) {
    if (ABSENT.has(error.code ?? "")) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }

  type Row = {
    id: string;
    status: string | null;
    started_at: string | null;
    worker_id: string | null;
    workers: { profile_id: string | null; display_name: string | null } | null;
  };

  const rows: BookedPerson[] = [];
  for (const r of (data ?? []) as Row[]) {
    // A GDPR-detached row (`worker_id is null`) is nobody's booking any more.
    if (!r.worker_id || !r.started_at) continue;
    const profileId = r.workers?.profile_id ?? null;
    if (!profileId) continue;
    if (opts.excludeWorkerIds.has(r.worker_id)) continue;
    const name = r.workers?.display_name?.trim() || null;
    rows.push({
      engagementId: r.id,
      workerId: r.worker_id,
      profileId,
      name,
      startedAt: r.started_at,
      isMember: opts.memberProfileIds.has(profileId),
    });
  }
  return { kind: "ok", rows };
}
