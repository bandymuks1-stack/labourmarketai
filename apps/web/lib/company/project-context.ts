import { createClient } from "@/lib/supabase/server";

/**
 * Company project/client context readiness (v1) — read-only, honest.
 *
 * The project / object / client / work-item data model is now live in prod
 * (migrations 20260601090000 + 20260601091000): journal_entry_work_items,
 * project_clients, project_members, project_worker_assignments,
 * journal_entries.project_id, can_manage_project(). But NOTHING is auto-filled.
 *
 * This reads the real `projects` count for the company (RLS-scoped via
 * owns_company) so the UI can show a truthful empty state — "the layer is
 * structurally ready, here is how many projects exist (0), nothing was
 * fabricated." No writes, no fake rows, no other-table reads (the dependent
 * client/member/assignment/work-item layers only exist once a project does, so
 * an honest "0 projects" already describes them).
 */
export type CompanyProjectContext = {
  /** The data-model foundation is applied in prod (always true post-merge). */
  foundationReady: true;
  /** Real count of the company's projects (0 until the owner creates one in a
   *  future write-enabled slice). */
  projects: number;
};

export async function getCompanyProjectContext(
  companyId: string | null,
): Promise<CompanyProjectContext> {
  if (!companyId) return { foundationReady: true, projects: 0 };
  const supabase = await createClient();
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  return { foundationReady: true, projects: count ?? 0 };
}
