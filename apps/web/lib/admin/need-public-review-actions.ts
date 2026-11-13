"use server";

import { revalidatePath } from "next/cache";

import { requireSuperadmin } from "@/lib/auth/superadmin";

import { decideNeedPublicReview, type NeedPublicDecision } from "./need-public-review";

/**
 * Operator decision on a held need (owner decision V-1). Double-gated:
 * requireSuperadmin() here AND public.is_admin() inside the SECURITY DEFINER
 * RPC. The decision binds to the need's current content in the database.
 */
export type NeedPublicReviewActionState =
  | { ok: true; decision: NeedPublicDecision }
  | { ok: false; code: "not_admin" | "invalid" | "not_reviewable" | "not_found" | "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Last non-empty valid entry: the hidden input and the clicked button both post `decision`. */
function readDecision(values: readonly FormDataEntryValue[]): NeedPublicDecision | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const s = (values[i] ?? "").toString();
    if (s === "approved" || s === "rejected") return s;
  }
  return null;
}

export async function decideNeedPublicReviewAction(
  _prev: NeedPublicReviewActionState | null,
  formData: FormData,
): Promise<NeedPublicReviewActionState> {
  await requireSuperadmin("lt");
  const requestId = String(formData.get("request_id") ?? "").trim();
  const decision = readDecision(formData.getAll("decision"));
  const reason = formData.get("reason")?.toString() ?? null;
  if (!UUID.test(requestId) || !decision) return { ok: false, code: "invalid" };

  const r = await decideNeedPublicReview(requestId, decision, reason);
  switch (r.kind) {
    case "ok":
      revalidatePath("/", "layout");
      return { ok: true, decision };
    case "not-admin":
      return { ok: false, code: "not_admin" };
    case "not-reviewable":
      return { ok: false, code: "not_reviewable" };
    case "not-found":
      return { ok: false, code: "not_found" };
    case "invalid":
      return { ok: false, code: "invalid" };
    default:
      return { ok: false, code: "error" };
  }
}
