"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * J-12 learner commands — thin wrappers over `request_education_cohort_join_v1`
 * and `withdraw_education_cohort_join_v1` (migration 20261102160000). The RPCs
 * hold every rule: the caller is the learner, the group must be open, and a
 * request grants nothing until the institution accepts it.
 */
export type CohortJoinActionState =
  | { status: "idle" }
  | { status: "requested" }
  | { status: "already_member" }
  | { status: "withdrawn" }
  | { status: "closed" }
  | { status: "invalid" }
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapJoinError(message: string | undefined): CohortJoinActionState {
  const m = (message ?? "").toLowerCase();
  if (m.includes("join_requests_closed")) return { status: "closed" };
  if (m.includes("invalid_request") || m.includes("cohort_not_found") || m.includes("no_pending_request"))
    return { status: "invalid" };
  return { status: "error" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpc(supabase: unknown): any {
  return supabase;
}

export async function requestCohortJoinAction(
  _prev: CohortJoinActionState,
  formData: FormData,
): Promise<CohortJoinActionState> {
  const cohortId = String(formData.get("cohortId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID.test(cohortId) || label.length < 2 || label.length > 120 || note.length > 500) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await rpc(supabase).rpc("request_education_cohort_join_v1", {
    p_cohort_id: cohortId,
    p_label: label,
    p_note: note || null,
  });
  if (error) return mapJoinError(error.message);
  revalidatePath("/[locale]/dashboard/profile", "page");
  return data === "already_member" ? { status: "already_member" } : { status: "requested" };
}

export async function withdrawCohortJoinAction(
  _prev: CohortJoinActionState,
  formData: FormData,
): Promise<CohortJoinActionState> {
  const cohortId = String(formData.get("cohortId") ?? "");
  if (!UUID.test(cohortId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("withdraw_education_cohort_join_v1", { p_cohort_id: cohortId });
  if (error) return mapJoinError(error.message);
  revalidatePath("/[locale]/dashboard/profile", "page");
  return { status: "withdrawn" };
}
