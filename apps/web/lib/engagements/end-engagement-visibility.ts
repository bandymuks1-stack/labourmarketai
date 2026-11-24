import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * F2 (#1097 follow-up) — does the company still see this worker AFTER the
 * engagement ended?
 *
 * The behavioural proof of 2026-08-13 measured the gap this module closes: a
 * worker who ends an engagement gets `{"outcome": "ended"}`, but when an
 * ACTIVE project assignment exists alongside it, the assignment branch of
 * `can_view_worker` keeps the employer's read alive. The worker reasonably
 * believes access ended. It did not. The product may not say "ended" and stop
 * talking — it has to state the visibility that remains.
 *
 * ─── WHAT THIS READS, AND AS WHOM ───────────────────────────────────────────
 * Everything runs on the CALLER's client, under the caller's RLS:
 *   - the engagement row — readable by its subject worker and its company
 *     owner (company_worker_engagements_select, 20260723120000);
 *   - the worker's own active assignments and the assigned projects
 *     (project_assigned_worker_read_v1, 20260803090000).
 * No service role, no SECURITY DEFINER, no new migration. A caller who could
 * not already read these rows gets `null`, never a wider read.
 *
 * ─── THREE-VALUED ON PURPOSE ────────────────────────────────────────────────
 *   true  — an active assignment on this company's project remains; the
 *           company still sees the worker (assignment branch, 20260809120000).
 *   false — no such assignment was READABLE; as far as this caller can
 *           establish, ending the engagement ended the relationship basis.
 *   null  — a read failed. Unknown is reported as unknown: claiming "they can
 *           still see you" on an error would be as dishonest as claiming
 *           "access ended". The surface renders nothing extra for null.
 *
 * The check mirrors the predicate's own condition (status = 'active' AND
 * ended_at IS NULL, project owned by the engagement's company) rather than
 * calling `can_view_worker` itself — the predicate answers for the CALLER,
 * and here the caller is the worker, not the company whose view we are
 * describing.
 */

type DbClient = Pick<SupabaseClient, "from">;

export async function companyStillSeesWorkerViaAssignment(
  client: DbClient,
  engagementId: string,
): Promise<boolean | null> {
  const { data: engagement, error: engagementError } = await client
    .from("company_worker_engagements")
    .select("company_id, worker_id")
    .eq("id", engagementId)
    .maybeSingle();

  if (engagementError || !engagement) return null;

  const row = engagement as { company_id: string | null; worker_id: string | null };
  // A GDPR-detached engagement (worker_id NULL, #856 model A) has no worker
  // whose visibility could persist — nothing to warn about.
  if (!row.company_id || !row.worker_id) return false;

  const { data: assignments, error: assignmentsError } = await client
    .from("project_worker_assignments")
    .select("project_id")
    .eq("worker_id", row.worker_id)
    .eq("status", "active")
    .is("ended_at", null);

  if (assignmentsError) return null;

  const projectIds = [
    ...new Set(
      (assignments ?? [])
        .map((a) => (a as { project_id: string | null }).project_id)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  ];
  if (projectIds.length === 0) return false;

  // Only projects of THE engagement's company matter: an assignment at a
  // different company is that relationship's own story, and warning about it
  // here would claim more than ending THIS engagement changed.
  const { data: projects, error: projectsError } = await client
    .from("projects")
    .select("id")
    .in("id", projectIds)
    .eq("company_id", row.company_id)
    .limit(1);

  if (projectsError) return null;
  return (projects ?? []).length > 0;
}
