"use server";

import { redirect } from "next/navigation";

import { switchActiveRole } from "@/lib/auth/actions";

/**
 * Open the REAL demand submit wizard (audit PR4, finding F-D1 follow-up;
 * W3 rows 7/8/25 consolidation).
 *
 * The wizard (`#demand-intake`) lives on /dashboard/company — its canonical
 * home since the advanced-page mount was removed. The company route admits
 * any HOLDER of the company role, so the anchor target always exists; the
 * role switch keeps the active workspace consistent with where the caller
 * lands (callers have already passed requireRoleOrRedirect("company")).
 */
export async function openDemandIntakeAsCompanyAction(locale: string): Promise<void> {
  await switchActiveRole("company");
  redirect(`/${locale}/dashboard/company#demand-intake`);
}
