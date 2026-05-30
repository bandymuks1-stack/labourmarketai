"use server";

import { revalidatePath } from "next/cache";

import {
  acceptCompanyWorkerInvitation,
  acceptAgencyWorkerInvitation,
  type AcceptInvitationOutcome,
} from "./invitations";

/**
 * Worker accepts a pending company/agency invitation (slice
 * sales-core-nonstop-v1, gap #1). Dispatches to the SECURITY DEFINER accept RPC
 * (migration 0036), which creates the real link for the authenticated worker.
 */

export type AcceptInvitationActionState =
  | { ok: true; outcome: AcceptInvitationOutcome }
  | { ok: false; code: "needs_migration" | "error" | "invalid"; message?: string };

export async function acceptWorkerInvitationAction(
  _prev: AcceptInvitationActionState | null,
  formData: FormData,
): Promise<AcceptInvitationActionState> {
  const kind = String(formData.get("kind") ?? "").trim();
  const orgId = String(formData.get("orgId") ?? "").trim();
  if (orgId === "" || (kind !== "company" && kind !== "agency")) {
    return { ok: false, code: "invalid" };
  }

  const r =
    kind === "company"
      ? await acceptCompanyWorkerInvitation(orgId)
      : await acceptAgencyWorkerInvitation(orgId);

  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, outcome: r.outcome };
}
