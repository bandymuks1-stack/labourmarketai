"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  REVIEW_SUCCESS_NOTICES,
  isReviewMigrationMissingCode,
  isValidReviewEvidenceKind,
  noticeForReviewOutcome,
  type ReviewNotice,
} from "@/lib/reviews/reviews-model";

/**
 * Development & Performance Reviews write actions (v1).
 *
 * The ONLY write paths are the seven gated SECURITY DEFINER commands the
 * human-gated migration 20260817231000_performance_reviews_v1 proposes:
 *
 *   create_review_cycle_v1 / set_review_cycle_status_v1 /
 *   create_performance_review_v1 / save_review_worker_input_v1 /
 *   save_review_manager_input_v1 / add_review_evidence_link_v1 /
 *   close_performance_review_v1
 *
 * BINDING DOCTRINE: there is no rating, score, grade or rank anywhere in
 * this module — no action accepts one and the schema has no column for one.
 * The two text inputs are SUBJECTIVE OBSERVATIONS by named people: the
 * subject writes their own (self-only, server-enforced), the reviewer writes
 * theirs (the author id is server-stamped, never taken from the form).
 * Evidence links are re-checked server-side against real rows.
 *
 * NATIVE-NAV forms: each action always redirects back to the network page
 * with an honest `?rev=` outcome. While the migration is unapplied the RPC
 * is missing and the notice says so honestly.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone. No AI.
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

function finish(locale: string, notice: ReviewNotice): never {
  if ((REVIEW_SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/network?rev=${notice}#reviews`);
}

function noticeForRpcError(error: { code?: string }): ReviewNotice {
  if (isReviewMigrationMissingCode(error.code)) return "needs_migration";
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
  finish(locale, noticeForReviewOutcome(String(data ?? "")));
}

/** Org owner/admin opens a named period. */
export async function createReviewCycleAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const org = await requireEmployerCompany();
  if (!org.ok) finish(locale, "not_authorized");

  const name = String(formData.get("name") ?? "").trim();
  const start = optionalDate(formData, "periodStart");
  const end = optionalDate(formData, "periodEnd");
  if (start === "invalid" || end === "invalid" || start === null || end === null) {
    finish(locale, "invalid");
  }

  await callRpc(locale, "create_review_cycle_v1", {
    p_organization_id: org.organizationId,
    p_name: name,
    p_period_start: start,
    p_period_end: end,
  });
}

/** Org owner/admin moves the period forward (draft → open → closed). */
export async function setReviewCycleStatusAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const cycleId = String(formData.get("cycleId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!UUID_RX.test(cycleId)) finish(locale, "invalid");
  if (status !== "open" && status !== "closed") finish(locale, "invalid");

  await callRpc(locale, "set_review_cycle_status_v1", {
    p_cycle_id: cycleId,
    p_status: status,
  });
}

/** Org owner/admin opens ONE review naming a subject and a reviewer. */
export async function createPerformanceReviewAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const cycleId = String(formData.get("cycleId") ?? "").trim();
  if (!UUID_RX.test(cycleId)) finish(locale, "invalid");
  const subjectEmail = String(formData.get("subjectEmail") ?? "").trim();
  const reviewerEmail = String(formData.get("reviewerEmail") ?? "").trim();
  if (subjectEmail.length === 0 || subjectEmail.length > 320) finish(locale, "invalid");
  if (reviewerEmail.length > 320) finish(locale, "invalid");

  await callRpc(locale, "create_performance_review_v1", {
    p_cycle_id: cycleId,
    p_subject_email: subjectEmail,
    p_reviewer_email: reviewerEmail.length > 0 ? reviewerEmail : null,
  });
}

/**
 * The SUBJECT writes their own subjective observation. Self-only: the RPC
 * refuses every other caller, so nobody ever writes this text on somebody
 * else's behalf.
 */
export async function saveReviewWorkerInputAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!UUID_RX.test(reviewId)) finish(locale, "invalid");
  const text = String(formData.get("workerInput") ?? "").trim();
  if (text.length === 0) finish(locale, "invalid");

  await callRpc(locale, "save_review_worker_input_v1", {
    p_review_id: reviewId,
    p_text: text,
  });
}

/**
 * The REVIEWER writes their subjective observation and the agreed plan. The
 * author id is stamped by the RPC from auth.uid(), never from this form.
 */
export async function saveReviewManagerInputAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!UUID_RX.test(reviewId)) finish(locale, "invalid");
  const managerInput = String(formData.get("managerInput") ?? "").trim();
  const plan = String(formData.get("developmentPlan") ?? "").trim();
  const followUp = optionalDate(formData, "followUpDate");
  if (followUp === "invalid") finish(locale, "invalid");
  if (managerInput.length === 0 && plan.length === 0 && followUp === null) {
    finish(locale, "invalid");
  }

  await callRpc(locale, "save_review_manager_input_v1", {
    p_review_id: reviewId,
    p_manager_input: managerInput.length > 0 ? managerInput : null,
    p_development_plan: plan.length > 0 ? plan : null,
    p_follow_up_date: followUp,
  });
}

/** Links EVIDENCE: a pointer to a real row, re-checked server-side. */
export async function addReviewEvidenceLinkAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const refId = String(formData.get("refId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  if (!UUID_RX.test(reviewId) || !UUID_RX.test(refId)) finish(locale, "invalid");
  if (!isValidReviewEvidenceKind(kind)) finish(locale, "invalid");
  const note = String(formData.get("note") ?? "").trim();

  await callRpc(locale, "add_review_evidence_link_v1", {
    p_review_id: reviewId,
    p_kind: kind,
    p_ref_id: refId,
    p_note: note.length > 0 ? note : null,
  });
}

/** Freezes the record. The RPC refuses unless BOTH voices are on it. */
export async function closePerformanceReviewAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!UUID_RX.test(reviewId)) finish(locale, "invalid");

  await callRpc(locale, "close_performance_review_v1", { p_review_id: reviewId });
}
