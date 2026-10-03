"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { callerCompanyId } from "./projects";
import { insertProjectForCompany } from "@/lib/projects/create-project-core";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { checkWorkerReservation } from "@/lib/planning/worker-reservation";
import { freeColleagues } from "@/lib/projects/free-colleagues";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";
import { parseOverrideReasonCode, toReceiptCollisions } from "@/lib/projects/override-receipt-model";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { displayedWorkspaceOf, refuseStaleWorkspace } from "@/lib/company/stale-workspace";

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
  | {
      ok: true;
      id?: string;
      /**
       * CAL-7. What this person was ALREADY committed to across the project's
       * dates, measured at the moment of commitment. Present only on assign,
       * and only when the check could run at all.
       *
       * It arrives AFTER the write and can never prevent one (SEP-2: a
       * reservation warns, it never prohibits). The manager is told
       * immediately, on the screen where they can act on it, instead of
       * discovering the clash later on a calendar they were not looking at.
       */
      reservation?: ReservationVerdict;
      /** The assignment this call just wrote — so the screen can offer the
       *  human decision (keep / undo / swap) without guessing which row. */
      assigned?: { projectId: string; workerProfileId: string };
      /** Present only when the verdict collides: colleagues CONFIRMED free on
       *  the same dates (never an unknown) — the alternatives step of the
       *  conflict flow. Names are the roster's own display names. */
      alternatives?: { profileId: string; name: string }[];
    }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "no_company" | "not_authorized" | "error";
      message?: string;
    };

/** The success branch, named. Callers that map a successful assignment into
 *  another shape (the chat executors) need this type; spelling it inline as
 *  `Extract<ProjectActionResult, { ok: true }>` puts a literal `ok: true` in
 *  their source, which the fake-success guard in
 *  `lib/conversation/worker-journey-security.test.ts` reads as a fabricated
 *  success. The guard is right to be blunt about that pattern; a named type
 *  is the better spelling anyway. */
export type ProjectActionOk = Extract<ProjectActionResult, { ok: true }>;

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
  await refuseStaleWorkspace(displayedWorkspaceOf(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const title = String(formData.get("title") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;

  // Same gate as the dedicated create route (`project-context-actions`):
  // the ACTIVE workspace's company AND the manage-projects capability. Until
  // 2026-09-19 this inline path checked only the company, so a `member`
  // governance role could create projects here and not there.
  const company = await requireEmployerCompany();
  if (!company.ok) return { ok: false, code: "no_company" };
  if (!hasOrganizationCapability(company.role, "manage-projects")) {
    return { ok: false, code: "not_authorized" };
  }
  const companyId = company.companyId;

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
  // W14 mid-funnel: a worker was really assigned to a project (RPC ok).
  // No ids in metadata. Fire-and-forget.
  emitServerFunnelEvent(FUNNEL_EVENTS.projectAssigned, {
    source: "projects",
    metadata: { surface: "projects", role_context: "company" },
  });
  const reservation = await reservationAfterAssign(supabase, projectId, workerProfileId);
  const assigned = { projectId, workerProfileId };
  if (!reservation) return { ok: true, assigned };
  return reservation.alternatives.length > 0
    ? { ok: true, assigned, reservation: reservation.verdict, alternatives: reservation.alternatives }
    : { ok: true, assigned, reservation: reservation.verdict };
}

/**
 * CAL-7 — the reservation check, run AFTER the assignment succeeded.
 *
 * AFTER, deliberately. A capacity warning may never decide whether a
 * commitment happens (SEP-2), and running it first would make a slow or
 * failing read able to delay or break a write it has no authority over.
 * Everything here is wrapped so that no failure of the check can turn a
 * successful assignment into an error: the worst case is that the manager is
 * told nothing extra, which is exactly where the product was before.
 *
 * The project being assigned to is excluded — the assignment just written
 * would otherwise be reported as a collision with itself.
 */
async function reservationAfterAssign(
  supabase: SupabaseClient,
  projectId: string,
  workerProfileId: string,
): Promise<{
  verdict: ReservationVerdict;
  alternatives: { profileId: string; name: string }[];
} | null> {
  try {
    const [{ data: worker }, { data: project }] = await Promise.all([
      asAny(supabase).from("workers").select("id").eq("profile_id", workerProfileId).maybeSingle(),
      asAny(supabase).from("projects").select("start_date, end_date").eq("id", projectId).maybeSingle(),
    ]);
    if (!worker?.id) return null;
    const window = {
      startDate: (project?.start_date as string | null) ?? null,
      endDate: (project?.end_date as string | null) ?? null,
    };
    const verdict = await checkWorkerReservation({
      workerId: worker.id as string,
      window,
      exclude: [projectId],
    });
    if (verdict.state !== "collides") return { verdict, alternatives: [] };
    return {
      verdict,
      alternatives: await freeColleagues(supabase, workerProfileId, projectId, window),
    };
  } catch (error) {
    console.error("[projects] reservation check failed:", error);
    return null;
  }
}

/**
 * AUDIT of the human decision on a collision (kept / undone / swapped). One
 * append to the existing `audit_logs` through a narrow SECURITY DEFINER writer.
 * Best-effort by design: the decision itself already happened, so a missing
 * function (not yet applied) or a failed write must never undo or fail it.
 */
export async function recordAssignmentDecisionAction(
  projectId: string,
  workerProfileId: string,
  decision: "kept" | "undone" | "swapped",
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await asAny(supabase).rpc("record_assignment_decision", {
      p_project_id: projectId,
      p_worker_profile_id: workerProfileId,
      p_decision: decision,
    });
    if (error && !migMissing(error.code)) {
      console.error("[projects] decision audit failed:", error.message);
    }
  } catch (error) {
    console.error("[projects] decision audit failed:", error);
  }
}

export type KeepAssignmentResult =
  | {
      ok: true;
      /** recorded = an immutable receipt exists; not_needed = the clash no
       *  longer exists at decision time, so there is no override to record. */
      receipt: "recorded" | "not_needed";
    }
  | { ok: false; code: "auth" | "invalid" | "not_authorized" | "needs_migration" | "error" };

/**
 * KEEP an assignment despite a known calendar clash = an explicit override.
 *
 * FAIL-LOUD: unlike the best-effort audit append, a failed receipt is returned
 * to the caller, which must NOT present the decision as made. The collisions
 * are recomputed HERE, server-side, at the moment of the decision (never taken
 * from the client), reduced to the whitelisted receipt shape (an absence keeps
 * kind + dates only), and handed to record_commitment_override_v1, which
 * re-validates authority and shape. The reason is a closed code, or none.
 */
export async function keepAssignmentAction(
  projectId: string,
  workerProfileId: string,
  reasonCode?: string | null,
): Promise<KeepAssignmentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!projectId || !workerProfileId) return { ok: false, code: "invalid" };
  const reason = reasonCode ? parseOverrideReasonCode(reasonCode) : null;
  if (reasonCode && !reason) return { ok: false, code: "invalid" };

  const reservation = await reservationAfterAssign(supabase, projectId, workerProfileId);
  // The check could not run: the receipt would be written blind. Say so.
  if (!reservation) return { ok: false, code: "error" };
  const collisions = toReceiptCollisions(reservation.verdict);
  if (reservation.verdict.state !== "collides" || collisions.length === 0) {
    await recordAssignmentDecisionAction(projectId, workerProfileId, "kept");
    return { ok: true, receipt: "not_needed" };
  }

  const { error } = await asAny(supabase).rpc("record_commitment_override_v1", {
    p_project_id: projectId,
    p_worker_profile_id: workerProfileId,
    p_collisions: collisions,
    p_reason_code: reason,
  });
  if (error) {
    if (migMissing(error.code) || error.code === "PGRST202") return { ok: false, code: "needs_migration" };
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[projects] override receipt failed:", error.message);
    return { ok: false, code: "error" };
  }
  await recordAssignmentDecisionAction(projectId, workerProfileId, "kept");
  revalidatePath("/", "layout");
  return { ok: true, receipt: "recorded" };
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
