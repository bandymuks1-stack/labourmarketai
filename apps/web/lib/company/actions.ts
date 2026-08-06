"use server";

import { revalidatePath } from "next/cache";

import {
  assignCompanyWorkerRole,
  inviteCompanyWorker,
  provisionCompanyWorkerEngagementContext,
  setCompanyWorkerJournalReview,
  type InviteCompanyWorkerResult,
} from "./company-workers";
import {
  isEmployerContextFailure,
  requireEmployerCompany,
  type EmployerContextReason,
} from "./employer-company-context";
import { hasOrganizationCapability } from "./role-capabilities";
import type { AssignRoleActionState } from "@/lib/operations/assign-operations-role";
import type {
  ProvisionEngagementActionState,
  SetJournalReviewActionState,
} from "@/lib/operations/journal-review-actions";

/**
 * M-P0-3: every roster write below derives its company from the ACTIVE
 * WORKSPACE (`requireEmployerCompany` — httpOnly pointer, membership-validated
 * per request), never from `companies.profile_id = auth.uid()`. A person who
 * owns organizations A and B acts on exactly the selected one; the Personal
 * workspace, a stale/revoked workspace and "no organization" all fail closed.
 * The SECURITY DEFINER RPCs re-validate ownership of the forwarded id
 * server-side, so this layer choosing the WRONG id can still never cross a
 * tenant — it can only fail.
 *
 * Reason → result-code mapping stays inside each action's EXISTING tagged
 * vocabulary: infrastructure failures (`isEmployerContextFailure`) map to
 * "error" so a broken environment is never rendered as "you have no
 * organization"; `needs-migration` keeps its dedicated code where the state
 * type has one; every legitimate "not acting as a company right now" reason
 * maps to the action's no-company/no-org code.
 */
function noCompanyCode(
  reason: EmployerContextReason,
): "no_company" | "needs_migration" | "error" {
  if (reason === "needs-migration") return "needs_migration";
  return isEmployerContextFailure(reason) ? "error" : "no_company";
}

function noOrgCode(
  reason: EmployerContextReason,
): "no_org" | "needs_migration" | "error" {
  if (reason === "needs-migration") return "needs_migration";
  return isEmployerContextFailure(reason) ? "error" : "no_org";
}

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

  // M-P0-3: the invite belongs to the ACTIVE workspace's company — selected
  // explicitly, never inferred from the first/only owned row.
  const company = await requireEmployerCompany();
  if (!company.ok) return { ok: false, code: noCompanyCode(company.reason) };
  // §11 capability matrix: roster writes are operational governance.
  if (!hasOrganizationCapability(company.role, "manage-roster")) {
    return { ok: false, code: "no_company" };
  }

  const r = await inviteCompanyWorker(company.companyId, email, note);
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

  const company = await requireEmployerCompany();
  if (!company.ok) return { ok: false, code: noOrgCode(company.reason) };
  // §11 capability matrix: roster writes are operational governance.
  if (!hasOrganizationCapability(company.role, "manage-roster")) {
    return { ok: false, code: "no_org" };
  }
  if (workerId === "") return { ok: false, code: "error" };

  const r = await assignCompanyWorkerRole(
    company.companyId,
    workerId,
    operationsRole,
    operationsTitle,
  );
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}

/**
 * Owner/admin-only: provision (idempotently) the employment→journal
 * engagement_context bridge for a company↔worker relationship. Makes the
 * relationship bridge-ready; it does NOT enable review. Ownership is
 * re-validated inside the SECURITY DEFINER RPC (migration 0032).
 */
export async function provisionCompanyWorkerEngagementContextAction(
  _prev: ProvisionEngagementActionState | null,
  formData: FormData,
): Promise<ProvisionEngagementActionState> {
  const workerId = String(formData.get("workerId") ?? "").trim();

  const company = await requireEmployerCompany();
  if (!company.ok) return { ok: false, code: noOrgCode(company.reason) };
  // §11 capability matrix: roster writes are operational governance.
  if (!hasOrganizationCapability(company.role, "manage-roster")) {
    return { ok: false, code: "no_org" };
  }
  if (workerId === "") return { ok: false, code: "error" };

  const r = await provisionCompanyWorkerEngagementContext(
    company.companyId,
    workerId,
  );
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}

/**
 * Owner/admin-only: enable or disable journal review for a company↔worker
 * relationship. Enabling is gated server-side on a real active engagement_context
 * (migration 0033); disabling is always allowed. The desired state is read from
 * the `enabled` form field ("true" enables). Ownership re-validated in the RPC.
 */
export async function setCompanyWorkerJournalReviewAction(
  _prev: SetJournalReviewActionState | null,
  formData: FormData,
): Promise<SetJournalReviewActionState> {
  const workerId = String(formData.get("workerId") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";

  const company = await requireEmployerCompany();
  if (!company.ok) return { ok: false, code: noOrgCode(company.reason) };
  // §11 capability matrix: roster writes are operational governance.
  if (!hasOrganizationCapability(company.role, "manage-roster")) {
    return { ok: false, code: "no_org" };
  }
  if (workerId === "") return { ok: false, code: "error" };

  const r = await setCompanyWorkerJournalReview(
    company.companyId,
    workerId,
    enabled,
  );
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}
