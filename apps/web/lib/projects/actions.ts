"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { callerCompanyId } from "./projects";
import { resolveOrganizationIdForCompany } from "@/lib/company/resolve-organization-id";

/**
 * Project + assignment server actions (slice f4-worker-project-assignment-v1).
 *
 * - createProjectAction → inserts a `projects` row (RLS: owns_company gates it).
 * - assignWorkerToProjectAction → the SECURITY DEFINER assign_worker_to_project
 *   RPC (project + caller-roster gate). Direct PWA writes are revoked, so this is
 *   the only assign path.
 * - endAssignmentAction → end_worker_project_assignment RPC (status='ended', no delete).
 *
 * Tagged returns; `needs_migration` surfaced cleanly until the F4 migration applies.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

export type ProjectActionResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "no_company" | "not_authorized" | "error";
      message?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function migMissing(code?: string): boolean {
  return code === RPC_NOT_FOUND || code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}

export async function createProjectAction(
  _prev: ProjectActionResult | null,
  formData: FormData,
): Promise<ProjectActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const title = String(formData.get("title") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  if (title.length === 0) return { ok: false, code: "invalid" };

  const companyId = await callerCompanyId();
  if (!companyId) return { ok: false, code: "no_company" };

  // W10: bind the canonical organization at creation so the project is never
  // left org-less (the stale state the W10 backfill corrected).
  const organizationId = await resolveOrganizationIdForCompany(supabase, companyId);

  const { data, error } = await asAny(supabase)
    .from("projects")
    .insert({
      company_id: companyId,
      organization_id: organizationId,
      title: title.slice(0, 200),
      city,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) {
    if (migMissing(error.code)) return { ok: false, code: "needs_migration" };
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[projects] create failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, id: data?.id };
}

export async function assignWorkerToProjectAction(
  _prev: ProjectActionResult | null,
  formData: FormData,
): Promise<ProjectActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const projectId = String(formData.get("project_id") ?? "").trim();
  const workerProfileId = String(formData.get("worker_profile_id") ?? "").trim();
  if (!projectId || !workerProfileId) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("assign_worker_to_project", {
    p_project_id: projectId,
    p_worker_profile_id: workerProfileId,
  });
  if (error) {
    if (migMissing(error.code)) return { ok: false, code: "needs_migration" };
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[projects] assign failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function endAssignmentAction(
  projectId: string,
  workerProfileId: string,
): Promise<ProjectActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!projectId || !workerProfileId) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("end_worker_project_assignment", {
    p_project_id: projectId,
    p_worker_profile_id: workerProfileId,
  });
  if (error) {
    if (migMissing(error.code)) return { ok: false, code: "needs_migration" };
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[projects] end failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
