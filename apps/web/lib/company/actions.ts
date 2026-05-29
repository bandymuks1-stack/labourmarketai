"use server";

import { revalidatePath } from "next/cache";

import {
  assignCompanyWorkerRole,
  getOwnCompany,
  inviteCompanyWorker,
  type InviteCompanyWorkerResult,
} from "./company-workers";
import type { AssignRoleActionState } from "@/lib/operations/assign-operations-role";

export type InviteCompanyFormState =
  | {
      ok: true;
      outcome: NonNullable<
        Extract<InviteCompanyWorkerResult, { kind: "ok" }>["outcome"]
      >;
    }
  | { ok: false; code: "no_company" | "needs_migration" | "error"; message?: string };

export async function inviteCompanyWorkerAction(
  _prev: InviteCompanyFormState | null,
  formData: FormData,
): Promise<InviteCompanyFormState> {
  const email = String(formData.get("email") ?? "");
  const note = formData.get("note") ? String(formData.get("note")) : null;

  const company = await getOwnCompany();
  if (!company) return { ok: false, code: "no_company" };

  const r = await inviteCompanyWorker(company.id, email, note);
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}

/**
 * Owner/admin-only: assign or clear a company↔worker operations role + title.
 * journal_review_enabled is never set here — the wrapper/RPC reject any enable
 * attempt (review can't come from a label). Ownership is re-validated inside
 * the SECURITY DEFINER RPC; this action only forwards the owner's own company.
 */
export async function assignCompanyWorkerRoleAction(
  _prev: AssignRoleActionState | null,
  formData: FormData,
): Promise<AssignRoleActionState> {
  const workerId = String(formData.get("workerId") ?? "").trim();
  const roleRaw = String(formData.get("operationsRole") ?? "").trim();
  const operationsRole = roleRaw === "" ? null : roleRaw;
  const titleRaw = formData.get("operationsTitle");
  const operationsTitle = titleRaw ? String(titleRaw) : null;

  const company = await getOwnCompany();
  if (!company) return { ok: false, code: "no_org" };
  if (workerId === "") return { ok: false, code: "error" };

  const r = await assignCompanyWorkerRole(
    company.id,
    workerId,
    operationsRole,
    operationsTitle,
  );
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}
