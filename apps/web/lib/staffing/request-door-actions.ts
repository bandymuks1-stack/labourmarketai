"use server";

import { getLocale } from "next-intl/server";

import { recordPublicFormRefusal, screenPublicFormTiming } from "../security/public-form-guard";
import { persistPublicCompanyNeed } from "./company-need-public-intake";
import { notifyTeamOfStoredIntake } from "./intake-alert";
import { isRequestDoor, requestDoorIntake } from "./request-doors";

/**
 * One commercial request from the landing, with no account. A person is told "received"
 * ONLY when the row is stored: every other outcome keeps what they typed and says so.
 * A filled hidden field, a missing or impossibly fast fill time, a pile of links or an
 * advert (lib/security/public-form-guard.ts) stores and alerts nothing and gets the one
 * generic "could not send, try again later" (`unavailable`), whichever check tripped.
 */
export type RequestDoorResult = "received" | "invalid" | "limited" | "unavailable";

export async function submitRequestDoorAction(formData: FormData): Promise<RequestDoorResult> {
  const door = formData.get("door");
  if (!isRequestDoor(door)) return "invalid";

  const timing = screenPublicFormTiming((name) => String(formData.get(name) ?? ""));
  if (timing) {
    recordPublicFormRefusal("request-door", timing);
    return "unavailable";
  }

  const locale = await getLocale();
  const intake = requestDoorIntake(door, locale, (name) => String(formData.get(name) ?? "").trim());
  if (!intake) return "invalid";

  const stored = await persistPublicCompanyNeed(intake);
  if (!stored.ok) {
    if (stored.code === "invalid") return "invalid";
    return stored.code === "rate_limited" ? "limited" : "unavailable";
  }

  // The row is the record; the alert tells the team it is there. One alert per stored
  // row, to the configured mailbox, its outcome recorded and a failure retried
  // (lib/staffing/intake-alert.ts). Logged without the content.
  console.info("[request-door] stored", { door, alert: stored.advertising ? "not_sent" : await notifyTeamOfStoredIntake(stored.intakeId) });
  return "received";
}
