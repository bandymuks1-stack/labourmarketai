"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewPrivacyRequest } from "@/lib/admin/privacy-requests";

/**
 * Form action for the admin privacy-request review verbs (V9 phase 1).
 *
 * NATIVE-NAV: a plain progressive form post that ALWAYS redirects back to
 * the admin control room with an honest `?privacyReviewNotice=` outcome —
 * rendered by the section as a role="status" banner (the tasks/finance
 * pattern). No client JS. REVIEW ONLY — nothing here deletes anything.
 */

const NOTICE_BY_KIND: Record<string, string> = {
  ok: "saved",
  "not-superadmin": "not_superadmin",
  invalid: "invalid",
  "not-found": "not_found",
  "not-privacy-request": "not_privacy_request",
  "needs-migration": "needs_migration",
  error: "error",
};

export async function reviewPrivacyRequestAction(
  formData: FormData,
): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt");
  const result = await reviewPrivacyRequest({
    requestId: String(formData.get("request_id") ?? ""),
    status: String(formData.get("status") ?? ""),
    note: String(formData.get("note") ?? "") || null,
  });
  revalidatePath("/[locale]/dashboard/admin", "page");
  const notice = NOTICE_BY_KIND[result.kind] ?? "error";
  redirect(
    `/${locale}/dashboard/admin?privacyReviewNotice=${notice}#admin-privacy-requests-heading`,
  );
}

/**
 * Erasure (phase 3, #856 v2): executes ONLY an approved account-deletion
 * request after the typed confirmation word; the outcome comes back as
 * `?privacyErasureNotice=`. Refusals never change a row (the executor
 * rehearses first and stops on any refusal).
 */
export async function executeErasureAction(formData: FormData): Promise<void> {
  const { executeErasure } = await import("@/lib/admin/privacy-erasure");
  const locale = String(formData.get("locale") ?? "lt");
  const requestId = String(formData.get("request_id") ?? "");
  const result = await executeErasure(requestId, String(formData.get("confirmation") ?? ""));
  revalidatePath("/[locale]/dashboard/admin", "page");
  const notice = result.kind === "refused" ? "refused" : result.kind;
  const back = result.kind === "erased" ? "" : `&erasureRehearsalFor=${encodeURIComponent(requestId)}`;
  redirect(`/${locale}/dashboard/admin?privacyErasureNotice=${notice}${back}#admin-privacy-requests-heading`);
}
