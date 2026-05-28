"use server";

import { revalidatePath } from "next/cache";

import {
  getOwnAgency,
  inviteAgencyWorker,
  type InviteAgencyWorkerResult,
} from "./agency-workers";

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
