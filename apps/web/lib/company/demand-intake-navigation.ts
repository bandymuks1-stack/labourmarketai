"use server";

import { redirect } from "next/navigation";

import { switchActiveRole } from "@/lib/auth/actions";

/**
 * Open the REAL demand submit wizard from the company room (audit PR4,
 * finding F-D1 follow-up).
 *
 * The wizard (`#demand-intake`) renders only in the ORG branch of the
 * dashboard overview, but /dashboard/company admits any holder of the company
 * role even while their ACTIVE role is `worker` — for exactly that user a
 * plain link landed on the worker home with no wizard anywhere. Switching the
 * active workspace first guarantees the anchor target exists; the caller has
 * already passed requireRoleOrRedirect("company"), so they hold the role.
 */
export async function openDemandIntakeAsCompanyAction(locale: string): Promise<void> {
  await switchActiveRole("company");
  redirect(`/${locale}/dashboard#demand-intake`);
}
