"use server";

import { revalidatePath } from "next/cache";
import {
  claimPublicIntake,
  type ClaimIntakeResult,
} from "@/lib/company/claim-public-intake";

/** Canonical-journey P3 — server-action wrapper for the intake claim bridge.
 *  Thin: authorization (authenticated-email match) lives in the lib. */
export async function claimPublicIntakeAction(
  locale: string,
  intakeId: string,
): Promise<ClaimIntakeResult> {
  const result = await claimPublicIntake(intakeId);
  if (result.ok) {
    revalidatePath(`/${locale}/dashboard/company`);
    revalidatePath(`/${locale}/dashboard`);
  }
  return result;
}
