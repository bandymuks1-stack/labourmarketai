"use server";

import { revalidatePath } from "next/cache";

import {
  saveCustomerRequest,
  type CustomerRequestStatus,
} from "./customer-requests";

export type BuyerRequestFormState =
  | { ok: true; requestId: string }
  | { ok: false; code: "needs_migration" | "invalid" | "error"; message?: string };

function parseTeamSize(v: FormDataEntryValue | null): number | undefined {
  if (!v) return undefined;
  const s = v.toString().trim();
  if (s.length === 0) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseStatus(v: FormDataEntryValue | null): CustomerRequestStatus {
  const s = (v ?? "").toString();
  if (s === "submitted") return "submitted";
  return "draft";
}

export async function saveBuyerRequestAction(
  _prev: BuyerRequestFormState | null,
  formData: FormData,
): Promise<BuyerRequestFormState> {
  const requestIdRaw = formData.get("request_id");
  const requestId = requestIdRaw ? requestIdRaw.toString() : null;
  const r = await saveCustomerRequest({
    requestId,
    title: String(formData.get("title") ?? ""),
    needSummary: formData.get("need_summary")?.toString(),
    country: formData.get("country")?.toString(),
    location: formData.get("location")?.toString(),
    roleOrWorkType: formData.get("role_or_work_type")?.toString(),
    teamSize: parseTeamSize(formData.get("team_size")),
    startPeriod: formData.get("start_period")?.toString(),
    duration: formData.get("duration")?.toString(),
    languageRequirement: formData.get("language_requirement")?.toString(),
    notes: formData.get("notes")?.toString(),
    status: parseStatus(formData.get("status")),
  });
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "invalid") return { ok: false, code: "invalid", message: r.message };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, requestId: r.requestId };
}
