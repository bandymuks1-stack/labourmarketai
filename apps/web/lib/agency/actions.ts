"use server";

import { revalidatePath } from "next/cache";

import {
  assignAgencyWorkerRole,
  getOwnAgency,
  inviteAgencyWorker,
  type InviteAgencyWorkerResult,
} from "./agency-workers";
import type { AssignRoleActionState } from "@/lib/operations/assign-operations-role";

export type InviteFormState =
  | { ok: true; outcome: NonNullable<Extract<InviteAgencyWorkerResult, { kind: "ok" }>["outcome"]> }
  | { ok: false; code: "no_agency" | "needs_migration" | "error"; message?: string };

export async function inviteAgencyWorkerAction(
  _prev: InviteFormState | null,
  formData: FormData,
): Promise<InviteFormState> {
  const email = String(formData.get("email") ?? "");
  const note = formData.get("note") ? String(formData.get("note")) : null;

  const agency = await getOwnAgency();
  if (!agency) return { ok: false, code: "no_agency" };

  const r = await inviteAgencyWorker(agency.id, email, note);
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}

/**
 * Owner/admin-only: assign or clear an agency↔worker operations role + title.
 * Mirrors assignCompanyWorkerRoleAction; journal_review_enabled never set here
 * (the wrapper/RPC reject any enable attempt). Ownership re-validated in the
 * SECURITY DEFINER RPC.
 */
export async function assignAgencyWorkerRoleAction(
  _prev: AssignRoleActionState | null,
  formData: FormData,
): Promise<AssignRoleActionState> {
  const workerId = String(formData.get("workerId") ?? "").trim();
  const roleRaw = String(formData.get("operationsRole") ?? "").trim();
  const operationsRole = roleRaw === "" ? null : roleRaw;
  const titleRaw = formData.get("operationsTitle");
  const operationsTitle = titleRaw ? String(titleRaw) : null;

  const agency = await getOwnAgency();
  if (!agency) return { ok: false, code: "no_org" };
  if (workerId === "") return { ok: false, code: "error" };

  const r = await assignAgencyWorkerRole(
    agency.id,
    workerId,
    operationsRole,
    operationsTitle,
  );
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}
