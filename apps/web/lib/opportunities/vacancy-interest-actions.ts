"use server";

import { revalidatePath } from "next/cache";
import {
  expressVacancyInterest,
  withdrawVacancyInterest,
  type VacancyInterestWriteResult,
} from "@/lib/opportunities/vacancy-interest";

/**
 * Server actions for interest in a PUBLIC VACANCY — thin wrappers over the
 * RLS-scoped lib flows. The interest is a stored signal; the only thing it
 * "sends" is a `commercial_handoffs` row for the commercial partner's workflow
 * (owner-gated on delivery). No email, no message, no employer contact.
 */

export async function expressVacancyInterestAction(
  locale: string,
  vacancyId: string,
  propositionConsent: boolean,
): Promise<VacancyInterestWriteResult> {
  const result = await expressVacancyInterest({
    vacancyId,
    propositionConsent: propositionConsent === true,
  });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/opportunities`);
    revalidatePath("/[locale]/jobs/[id]", "page");
  }
  return result;
}

export async function withdrawVacancyInterestAction(
  locale: string,
  vacancyId: string,
): Promise<VacancyInterestWriteResult> {
  const result = await withdrawVacancyInterest({ vacancyId });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/opportunities`);
    revalidatePath("/[locale]/jobs/[id]", "page");
  }
  return result;
}
