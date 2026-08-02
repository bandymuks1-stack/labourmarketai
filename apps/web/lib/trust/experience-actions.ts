"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import {
  submitExperienceRecord,
  submitExperienceResponse,
  openExperienceDispute,
  startExperienceModeration,
  decideExperienceModeration,
  resolveExperienceDispute,
  type ExperienceActionResult,
} from "./experience-records";
import type { EligibleInteractionKind } from "./experience-eligibility";

/**
 * W6 slice 3B — server actions for the ONE experience domain.
 *
 * Every action is a THIN wrapper: the client's `interaction_id`,
 * `subject_id` and workspace are NEVER treated as permission. The RPC
 * re-derives eligibility and authorization server-side, and this layer only
 * shapes the form payload and maps the honest outcome. Absent migration →
 * `needs_migration`, surfaced as a product-level unavailable state.
 *
 * REVALIDATION TARGETS follow the surfaces that actually exist. Slice 3B
 * pointed these at `/dashboard/experiences` and
 * `/dashboard/admin/experience-moderation`; the Product Gate refused both
 * screens (A-09) and they were deleted. The domain now lives in the
 * `?result=experiences` Workspace Result under `/dashboard`, and the moderator
 * queue is a band on the EXISTING `/dashboard/admin` control room — so those
 * are the two paths revalidated. Revalidating a route that no longer exists
 * would be a silent no-op dressed up as a refresh.
 */

export type ExperienceFormState = ExperienceActionResult | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function submitExperienceAction(
  _prev: ExperienceFormState,
  formData: FormData,
): Promise<ExperienceFormState> {
  const locale = str(formData, "locale") || "lt";
  const sentiment = str(formData, "sentiment");
  if (sentiment !== "positive" && sentiment !== "negative") {
    return { ok: false, code: "invalid" };
  }
  const result = await submitExperienceRecord({
    subjectType: str(formData, "subject_type") === "organization" ? "organization" : "worker",
    subjectId: str(formData, "subject_id"),
    interactionKind: str(formData, "interaction_kind") as EligibleInteractionKind,
    interactionId: str(formData, "interaction_id"),
    sentiment,
    body: str(formData, "body"),
  });
  if (result.ok) revalidatePath(`/${locale}/dashboard`);
  return result;
}

export async function submitExperienceResponseAction(
  _prev: ExperienceFormState,
  formData: FormData,
): Promise<ExperienceFormState> {
  const locale = str(formData, "locale") || "lt";
  const result = await submitExperienceResponse({
    experienceId: str(formData, "experience_id"),
    body: str(formData, "body"),
  });
  if (result.ok) revalidatePath(`/${locale}/dashboard`);
  return result;
}

export async function openExperienceDisputeAction(
  _prev: ExperienceFormState,
  formData: FormData,
): Promise<ExperienceFormState> {
  const locale = str(formData, "locale") || "lt";
  const result = await openExperienceDispute({
    experienceId: str(formData, "experience_id"),
    reason: str(formData, "reason"),
  });
  if (result.ok) revalidatePath(`/${locale}/dashboard`);
  return result;
}

/** Moderator actions — authorization is the RPC's `is_admin()`, never a
 *  client-side role name. */
export async function startModerationAction(
  _prev: ExperienceFormState,
  formData: FormData,
): Promise<ExperienceFormState> {
  const locale = str(formData, "locale") || "lt";
  const result = await startExperienceModeration(str(formData, "experience_id"));
  if (result.ok) revalidatePath(`/${locale}/dashboard/admin`);
  return result;
}

export async function decideModerationAction(
  _prev: ExperienceFormState,
  formData: FormData,
): Promise<ExperienceFormState> {
  const locale = str(formData, "locale") || "lt";
  const decision = str(formData, "decision");
  if (decision !== "published" && decision !== "rejected") {
    return { ok: false, code: "invalid" };
  }
  const result = await decideExperienceModeration({
    id: str(formData, "experience_id"),
    decision,
    reason: str(formData, "reason"),
  });
  if (result.ok) revalidatePath(`/${locale}/dashboard/admin`);
  return result;
}

export async function resolveDisputeAction(
  _prev: ExperienceFormState,
  formData: FormData,
): Promise<ExperienceFormState> {
  const locale = str(formData, "locale") || "lt";
  const resolution = str(formData, "resolution");
  if (resolution !== "upheld" && resolution !== "changed" && resolution !== "removed") {
    return { ok: false, code: "invalid" };
  }
  const result = await resolveExperienceDispute({
    id: str(formData, "experience_id"),
    resolution,
    reason: str(formData, "reason"),
  });
  if (result.ok) revalidatePath(`/${locale}/dashboard/admin`);
  return result;
}
