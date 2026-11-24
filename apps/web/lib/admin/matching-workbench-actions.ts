"use server";

import { revalidatePath } from "next/cache";

import {
  recordHumanMatch,
  WORKBENCH_STATUSES,
  type WorkbenchStatus,
} from "@/lib/admin/matching-workbench";

/**
 * Server action for the human-run matching workbench. Returns a tagged state
 * (never throws — Next 15 prod strips thrown Error messages from server
 * actions). The hidden `status` input carries the clicked decision (React 19:
 * a submit button's name/value is not delivered to a function formAction).
 */
export interface MatchActionState {
  readonly ok: boolean;
  readonly code:
    | "saved"
    | "not_admin"
    | "invalid"
    | "not_found"
    | "needs_migration"
    | "error";
  readonly message?: string;
}

export async function recordHumanMatchAction(
  _prev: MatchActionState | null,
  formData: FormData,
): Promise<MatchActionState> {
  const requestId = String(formData.get("request_id") ?? "");
  const workerId = String(formData.get("worker_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!(WORKBENCH_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, code: "invalid" };
  }

  const result = await recordHumanMatch({
    requestId,
    workerId,
    note: note || null,
    status: status as WorkbenchStatus,
  });

  switch (result.kind) {
    case "ok":
      revalidatePath("/[locale]/dashboard/admin/matching", "page");
      return { ok: true, code: "saved" };
    case "not-admin":
      return { ok: false, code: "not_admin" };
    case "invalid":
      return { ok: false, code: "invalid" };
    case "not-found":
      return { ok: false, code: "not_found" };
    case "needs-migration":
      return { ok: false, code: "needs_migration" };
    default:
      return { ok: false, code: "error", message: result.message };
  }
}
