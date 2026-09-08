"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";
import { EDUCATION_TYPE_SLUGS } from "@/lib/worker/worker-education-model";


/**
 * Education programmes / cohorts — server actions (RED batch B). Thin
 * wrappers over the three SECURITY DEFINER commands; every rule (manager of
 * the organisation, training_provider capability, learner already linked as
 * a student) lives server-side in the RPCs (batch 20260903120000, applied).
 */
export type ProgramActionState =
  | { status: "idle" }
  | { status: "ok"; id?: string }
  | { status: "invalid" }
  | { status: "forbidden" }
  | { status: "error"; reason?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapErr(code: string | undefined, message: string | undefined): ProgramActionState {
  const m = (message ?? "").toLowerCase();
  if (m.includes("not_manager") || m.includes("not_education_institution") || m.includes("not_a_linked_learner"))
    return { status: "forbidden" };
  if (m.includes("unknown_") || m.includes("invalid") || m.includes("not_found")) return { status: "invalid" };
  return { status: "error", reason: code };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpc(supabase: unknown): any {
  return supabase;
}

export async function createProgramAction(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const profession = String(formData.get("targetProfessionSlug") ?? "").trim();
  const educationType = String(formData.get("educationTypeSlug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  if (!UUID.test(organizationId) || name.length < 2 || name.length > 160) return { status: "invalid" };
  if (profession && !PROFESSION_SLUGS.includes(profession)) return { status: "invalid" };
  if (educationType && !(EDUCATION_TYPE_SLUGS as readonly string[]).includes(educationType)) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await rpc(supabase).rpc("create_education_program_v1", {
    p_organization_id: organizationId,
    p_name: name,
    p_target_profession_slug: profession || null,
    p_education_type_slug: educationType || null,
    p_description: description || null,
  });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok", id: typeof data === "string" ? data : undefined };
}

export async function createCohortAction(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const programId = String(formData.get("programId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("startsOn") ?? "").trim();
  const endsOn = String(formData.get("endsOn") ?? "").trim();
  if (!UUID.test(programId) || name.length < 1 || name.length > 120) return { status: "invalid" };
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if ((startsOn && !date.test(startsOn)) || (endsOn && !date.test(endsOn))) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await rpc(supabase).rpc("create_education_cohort_v1", {
    p_program_id: programId,
    p_name: name,
    p_starts_on: startsOn || null,
    p_ends_on: endsOn || null,
  });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok", id: typeof data === "string" ? data : undefined };
}

export async function setCohortMemberAction(_prev: ProgramActionState, formData: FormData): Promise<ProgramActionState> {
  const cohortId = String(formData.get("cohortId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const status = String(formData.get("status") ?? "active");
  if (!UUID.test(cohortId) || !UUID.test(profileId)) return { status: "invalid" };
  if (status !== "active" && status !== "left") return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("set_education_cohort_member_v1", {
    p_cohort_id: cohortId,
    p_profile_id: profileId,
    p_status: status,
  });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}
