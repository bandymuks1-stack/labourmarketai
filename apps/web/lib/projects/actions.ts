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
import { proposeAssignmentAlternatives } from "@/lib/planning/assignment-alternatives";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";
import type { AlternativesProposal } from "@/lib/workforce/commitment-alternatives";

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
      /**
       * J-TIME-FREEDOM step 4. When the reservation COLLIDES, what the manager
       * could do instead: the same person on the nearest free window of the
       * same length, or someone else on the roster who is clear for these
       * dates. Proposed, never imposed; derived, never stored.
       */
      alternatives?: AlternativesProposal;
      /**
       * J-TIME-FREEDOM step 5. The assignment the notice is about, so the
       * receipt form can name it without a second read: `projects.id` and
       * `workers.id` (not a profile id). Present only when the check ran.
       */
      assignment?: { projectId: string; workerId: string };
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
  // W14 mid-funnel: a worker was really assigned to a project (RPC ok).
  // No ids in metadata. Fire-and-forget.
  emitServerFunnelEvent(FUNNEL_EVENTS.projectAssigned, {
    source: "projects",
    metadata: { surface: "projects", role_context: "company" },
  });
  const reservation = await reservationAfterAssign(supabase, projectId, workerProfileId);
  if (!reservation) return { ok: true };
  const alternatives = await alternativesAfterCollision(reservation, projectId, workerProfileId);
  const assignment = { projectId, workerId: reservation.workerId };
  return alternatives
    ? { ok: true, reservation: reservation.verdict, alternatives, assignment }
    : { ok: true, reservation: reservation.verdict, assignment };
}

/**
 * Step 4 of J-TIME-FREEDOM, run only when step 3 found a clash. Same
 * discipline as the check itself: after the write, never able to fail it,
 * and the worst case is that the manager sees the warning without the
 * proposals — which is where the product was before.
 */
async function alternativesAfterCollision(
  reservation: NonNullable<Awaited<ReturnType<typeof reservationAfterAssign>>>,
  projectId: string,
  workerProfileId: string,
): Promise<AlternativesProposal | null> {
  if (reservation.verdict.state !== "collides") return null;
  try {
    return await proposeAssignmentAlternatives({
      projectId,
      collidingWorkerId: reservation.workerId,
      verdict: reservation.verdict,
      window: reservation.window,
      notBefore: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    console.error("[projects] alternatives proposal failed:", error, workerProfileId);
    return null;
  }
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
  workerId: string;
  window: { startDate: string | null; endDate: string | null };
} | null> {
  try {
    const [{ data: worker }, { data: project }] = await Promise.all([
      asAny(supabase).from("workers").select("id").eq("profile_id", workerProfileId).maybeSingle(),
      asAny(supabase).from("projects").select("start_date, end_date").eq("id", projectId).maybeSingle(),
    ]);
    if (!worker?.id) return null;
    const workerId = worker.id as string;
    const window = {
      startDate: (project?.start_date as string | null) ?? null,
      endDate: (project?.end_date as string | null) ?? null,
    };
    const verdict = await checkWorkerReservation({ workerId, window, exclude: [projectId] });
    return { verdict, workerId, window };
  } catch (error) {
    console.error("[projects] reservation check failed:", error);
    return null;
  }
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
