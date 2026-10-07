"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  mapRecognitionRpcError,
  parseRecognitionForm,
  type RecognitionActionState,
} from "./recognition-model";

/**
 * SKL-9 — the assessor's act, as a server action. A thin wrapper over
 * `record_competency_recognition_v1` (owner packet P-3, draft PR #1741, a RED
 * migration that is NOT applied). Until it is, every call degrades to an
 * explicit `needs_migration` result: the form never pretends a recognition
 * was recorded. Every rule (training_provider capability, manager of the
 * assessor organisation, not the subject, not a beneficiary employer,
 * evidence belongs to the subject) lives in the RPC, not here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpc(supabase: unknown): any {
  return supabase;
}

export async function recordRecognitionAction(
  _prev: RecognitionActionState,
  formData: FormData,
): Promise<RecognitionActionState> {
  const parsed = parseRecognitionForm(formData);
  if (!parsed.ok) return { status: "invalid" };
  const v = parsed.value;
  const supabase = await createClient();
  const { data, error } = await rpc(supabase).rpc("record_competency_recognition_v1", {
    p_subject_profile_id: v.subjectProfileId,
    p_requirement_kind: v.requirementKind,
    p_requirement_key: v.requirementKey,
    p_requirement_country: v.requirementCountry,
    p_evidence_entry_ids: v.evidenceEntryIds,
    p_assessor_organization_id: v.assessorOrganizationId,
    p_decision: v.decision,
    p_valid_from: v.validFrom,
    p_valid_until: v.validUntil,
    p_note: v.note,
    p_supersedes_id: null,
  });
  if (error) return mapRecognitionRpcError(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "layout");
  return { status: "ok", id: typeof data === "string" ? data : undefined };
}
