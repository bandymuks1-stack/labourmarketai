"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  TRAINING_SUCCESS_NOTICES,
  isTrainingMigrationMissingCode,
  noticeForTrainingOutcome,
  type TrainingNotice,
} from "@/lib/training/training-model";

/**
 * Training & Certification write actions (v1).
 *
 * The ONLY write paths are the seven gated SECURITY DEFINER commands the
 * human-gated migration 20260817230000_training_certification_v1 proposes:
 *
 *   create_training_program_v1 / update_training_program_v1 /
 *   assign_training_v1 / complete_training_assignment_v1 /
 *   attach_training_certificate_v1 / set_training_assignment_expired_v1 /
 *   link_training_skill_v1
 *
 * All seven re-check authorization server-side, validate every enum and
 * bound, and answer with outcome strings. Direct table writes are REVOKEd —
 * these actions never insert/update/delete a row themselves. The acting
 * organization is resolved SERVER-SIDE from the active workspace, never from
 * the form.
 *
 * ACKNOWLEDGEMENT REUSE: there is no acknowledgement action here. Confirming
 * that a person has READ a training material is the DOCUMENT ENGINE's job
 * (`acknowledgeDocumentAction` in lib/documents/document-file-actions.ts,
 * bound to the exact file version). This module links to that truth and
 * never mirrors it.
 *
 * SKILL SEAM: `link_training_skill_v1` writes ONE training_skill_links row
 * and nothing else. It never writes worker_skills — the canonical skill
 * ladder's provenance vocabulary is closed and admitting a training
 * provenance is a later train and an owner decision.
 *
 * NATIVE-NAV forms: each action always redirects back to the documents page
 * with an honest `?trn=` outcome — feedback is the navigation itself. While
 * the migration is unapplied the RPC is missing (42883 / PGRST202 / 42P01)
 * and the notice says so honestly.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function readLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "lt");
  return LOCALE_RX.test(raw) ? raw : "lt";
}

function finish(locale: string, notice: TrainingNotice): never {
  if ((TRAINING_SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/documents?trn=${notice}#training`);
}

function noticeForRpcError(error: { code?: string }): TrainingNotice {
  if (isTrainingMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

function optionalDate(formData: FormData, name: string): string | null | "invalid" {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw.length === 0) return null;
  if (!DATE_RX.test(raw)) return "invalid";
  return raw;
}

async function callRpc(
  locale: string,
  name: string,
  args: Record<string, unknown>,
): Promise<never> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(name, args);
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForTrainingOutcome(String(data ?? "")));
}

/** Org owner/admin authors a reusable programme. */
export async function createTrainingProgramAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const org = await requireEmployerCompany();
  if (!org.ok) finish(locale, "not_authorized");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const materialRaw = String(formData.get("materialDocumentId") ?? "").trim();
  if (materialRaw.length > 0 && !UUID_RX.test(materialRaw)) finish(locale, "invalid");

  await callRpc(locale, "create_training_program_v1", {
    p_organization_id: org.organizationId,
    p_title: title,
    p_description: description.length > 0 ? description : null,
    p_material_document_id: materialRaw.length > 0 ? materialRaw : null,
  });
}

/** Org owner/admin edits a programme (null fields are left untouched). */
export async function updateTrainingProgramAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const programId = String(formData.get("programId") ?? "").trim();
  if (!UUID_RX.test(programId)) finish(locale, "invalid");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "").trim();
  if (isActive.length > 0 && isActive !== "true" && isActive !== "false") {
    finish(locale, "invalid");
  }

  await callRpc(locale, "update_training_program_v1", {
    p_program_id: programId,
    p_title: title.length > 0 ? title : null,
    p_description: description.length > 0 ? description : null,
    p_material_document_id: null,
    p_is_active: isActive.length > 0 ? isActive : null,
  });
}

/** A managing role assigns the programme to an active member of the org. */
export async function assignTrainingAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const programId = String(formData.get("programId") ?? "").trim();
  if (!UUID_RX.test(programId)) finish(locale, "invalid");
  const email = String(formData.get("assigneeEmail") ?? "").trim();
  if (email.length === 0 || email.length > 320) finish(locale, "invalid");
  const requiredBy = optionalDate(formData, "requiredBy");
  if (requiredBy === "invalid") finish(locale, "invalid");

  await callRpc(locale, "assign_training_v1", {
    p_program_id: programId,
    p_assignee_email: email,
    p_required_by: requiredBy,
  });
}

/** The ASSIGNEE records that they completed it. Self-only, fill-once. */
export async function completeTrainingAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!UUID_RX.test(assignmentId)) finish(locale, "invalid");
  const note = String(formData.get("note") ?? "").trim();

  await callRpc(locale, "complete_training_assignment_v1", {
    p_assignment_id: assignmentId,
    p_note: note.length > 0 ? note : null,
  });
}

/** A managing role records the certificate evidence (an existing file row). */
export async function attachTrainingCertificateAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const fileId = String(formData.get("documentFileId") ?? "").trim();
  if (!UUID_RX.test(assignmentId) || !UUID_RX.test(fileId)) finish(locale, "invalid");
  const issuedOn = optionalDate(formData, "issuedOn");
  const expiresOn = optionalDate(formData, "expiresOn");
  if (issuedOn === "invalid" || expiresOn === "invalid" || issuedOn === null) {
    finish(locale, "invalid");
  }

  await callRpc(locale, "attach_training_certificate_v1", {
    p_assignment_id: assignmentId,
    p_document_file_id: fileId,
    p_issued_on: issuedOn,
    p_expires_on: expiresOn,
  });
}

/** A managing role marks a lapsed certification. Explicit human act only. */
export async function markTrainingExpiredAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  if (!UUID_RX.test(assignmentId)) finish(locale, "invalid");

  await callRpc(locale, "set_training_assignment_expired_v1", {
    p_assignment_id: assignmentId,
  });
}

/**
 * Records this module's OWN honest linkage between a completed, certified
 * training and a skill. It is NOT a competence claim and NOT a worker_skills
 * write — see the migration header's SKILL SEAM section.
 */
export async function linkTrainingSkillAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const skillId = String(formData.get("skillId") ?? "").trim();
  if (!UUID_RX.test(assignmentId) || !UUID_RX.test(skillId)) finish(locale, "invalid");

  await callRpc(locale, "link_training_skill_v1", {
    p_assignment_id: assignmentId,
    p_skill_id: skillId,
  });
}
