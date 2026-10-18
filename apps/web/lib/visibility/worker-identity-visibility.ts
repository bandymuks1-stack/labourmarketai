import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WHO MAY SEE A WORKER'S NAME (owner directive 2026-10-18): a worker found
 * through the employer-visibility consent is ANONYMOUS by default. Profession,
 * skills, experience and availability are the consented professional picture;
 * the name is personal data that reaches an organization only through a real
 * working relationship or the worker's own per-organization disclosure.
 *
 * The `workers` row itself is readable by any employer once the worker granted
 * `profile_discoverability` (RLS `can_view_worker`), so "the row came back" is
 * NOT a permission to show the name. This answers the narrower question with
 * reads that are themselves relationship-scoped by RLS — none of them is opened
 * by the discoverability consent:
 *   - `caller_manages_worker`: active company / agency roster or engagement the
 *     caller owns;
 *   - an active `company_workers` roster link the caller can read (policy:
 *     company owner, the worker, admin, or a manager of the organization —
 *     delegated managers already see this person by name on the roster);
 *   - an active `engagement_contexts` row of that person the caller can read
 *     (policy: own row, `manages_organization`, admin) WHOSE relationship type
 *     grants worker visibility — the same registry filter `can_view_worker`
 *     applies, so `student` / `intern` enrolment (least-privilege learner
 *     visibility, 20260827210000) never discloses the name by itself;
 *   - an active `project_worker_assignments` row the caller can read
 *     (policy: `owns_worker` or `can_manage_project`).
 *
 * Fail-closed: any error is "no relationship" — the page then shows the
 * anonymized label, never a guessed name.
 */
export async function viewerHasWorkerRelation(
  supabase: SupabaseClient,
  workerId: string,
  workerProfileId: string | null,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  try {
    const { data: manages, error: mErr } = await sb.rpc("caller_manages_worker", {
      p_worker_id: workerId,
    });
    if (!mErr && manages === true) return true;

    const { data: roster, error: rErr } = await sb
      .from("company_workers")
      .select("id")
      .eq("worker_id", workerId)
      .eq("status", "active")
      .limit(1);
    if (!rErr && Array.isArray(roster) && roster.length > 0) return true;

    if (workerProfileId) {
      const { data: contexts, error: cErr } = await sb
        .from("engagement_contexts")
        .select("id, relationship_types!inner(grants_worker_visibility)")
        .eq("profile_id", workerProfileId)
        .eq("status", "active")
        .eq("relationship_types.grants_worker_visibility", true)
        .limit(1);
      if (!cErr && Array.isArray(contexts) && contexts.length > 0) return true;
    }

    const { data: assignments, error: aErr } = await sb
      .from("project_worker_assignments")
      .select("id")
      .eq("worker_id", workerId)
      .eq("status", "active")
      .is("ended_at", null)
      .limit(1);
    if (!aErr && Array.isArray(assignments) && assignments.length > 0) return true;
  } catch {
    return false;
  }
  return false;
}
