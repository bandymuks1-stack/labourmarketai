"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { callerCompanyId } from "./projects";
import { insertProjectForCompany } from "@/lib/projects/create-project-core";

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

  const companyId = await callerCompanyId();
  if (!companyId) return { ok: false, code: "no_company" };

  // Rebuild W5: BOTH project-create entry points insert through the ONE core
  // (validation + W10 org binding + insert shape live in exactly one place).
  const created = await insertProjectForCompany(supabase, companyId, { title, city });
  if (!created.ok) {
    if (created.reason === "invalid_title") return { ok: false, code: "invalid" };
    if (migMissing(created.code)) return { ok: false, code: "needs_migration" };
    if (created.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[projects] create failed:", created.message);
    return { ok: false, code: "error", message: created.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, id: created.id };
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

  // W8 slice 1 — WORKSPACE GATE. `assign_worker_to_project` already enforces
  // `can_manage_project` at the DB; this adds the missing ACTING-CONTEXT check
  // so a project cannot be staffed from a workspace that is not acting for the
  // owning company. Defence in depth, not a replacement for the RPC's own gate.
  if (!(await callerCompanyId())) return { ok: false, code: "no_company" };

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
