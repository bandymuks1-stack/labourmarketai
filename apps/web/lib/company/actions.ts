"use server";

import { revalidatePath } from "next/cache";

import {
  getOwnCompany,
  inviteCompanyWorker,
  type InviteCompanyWorkerResult,
} from "./company-workers";

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
