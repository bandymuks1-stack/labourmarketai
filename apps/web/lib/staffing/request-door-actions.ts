"use server";

import { getLocale } from "next-intl/server";

import { sendCompanyNeedOwnerAlert } from "../notifications/telegram-owner-alerts";
import { persistPublicCompanyNeed } from "./company-need-public-intake";
import { isRequestDoor, requestDoorIntake } from "./request-doors";

/**
 * One commercial request from the landing, with no account. A person is told "received"
 * ONLY when the row is stored: every other outcome keeps what they typed and says so.
 * A filled hidden field or an impossibly fast send is a bot. It is told the same as a
 * person, so it learns nothing, and nothing is stored or alerted.
 */
export type RequestDoorResult = "received" | "invalid" | "limited" | "unavailable";

/** Nobody reads and fills a short form this fast. */
const MIN_FILL_MS = 2500;

export async function submitRequestDoorAction(formData: FormData): Promise<RequestDoorResult> {
  const door = formData.get("door");
  if (!isRequestDoor(door)) return "invalid";

  const started = Number(formData.get("started"));
  const tooFast = Number.isFinite(started) && started > 0 && Date.now() - started < MIN_FILL_MS;
  if (String(formData.get("website") ?? "") !== "" || tooFast) return "received";

  const locale = await getLocale();
  const intake = requestDoorIntake(door, locale, (name) => String(formData.get(name) ?? "").trim());
  if (!intake) return "invalid";

  const stored = await persistPublicCompanyNeed(intake);
  if (!stored.ok) {
    if (stored.code === "invalid") return "invalid";
    return stored.code === "rate_limited" ? "limited" : "unavailable";
  }

  // The row is the record; the alert only shortens the wait for it. The result is logged
  // (never the content), because the 24-hour promise rests on someone being told.
  let alerted = false;
  try {
    alerted = await sendCompanyNeedOwnerAlert({
      companyName: intake.companyName,
      contact: [intake.contactEmail, intake.contactPhone].filter(Boolean).join(" "),
      sector: intake.sector,
      country: intake.country,
      cityRegion: intake.cityRegion,
      headcount: intake.headcount,
      urgency: intake.urgency,
      startOrDate: intake.startWindow,
      sourcePath: intake.sourcePath,
    });
  } catch {
    alerted = false;
  }
  console.info("[request-door] stored", { door, alerted });
  return "received";
}
