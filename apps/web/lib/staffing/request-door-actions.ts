"use server";

import { getLocale } from "next-intl/server";

import { sendSmtp, smtpConfigFromEnv } from "../email/smtp";
import { persistPublicCompanyNeed } from "./company-need-public-intake";
import { isRequestDoor, requestDoorAlert, requestDoorIntake, type RequestDoor } from "./request-doors";

/**
 * One commercial request from the landing, with no account. A person is told "received"
 * ONLY when the row is stored: every other outcome keeps what they typed and says so.
 * A filled hidden field or an impossibly fast send is a bot. It is told the same as a
 * person, so it learns nothing, and nothing is stored or alerted.
 */
export type RequestDoorResult = "received" | "invalid" | "limited" | "unavailable";

/** Nobody reads and fills a short form this fast. */
const MIN_FILL_MS = 2500;

/** The mailbox a person answers these from. */
const ALERT_TO = "info@labourmarket.ai";
/** The person is waiting for "received": a slow mail server must not hold it up. */
const ALERT_WAIT_MS = 8000;

/**
 * One internal mail: the door type and a link to the queue, never a name, a contact or
 * the request's text. Never throws, so a failed alert cannot lose a stored request.
 */
async function alertTeam(door: RequestDoor): Promise<boolean> {
  try {
    const smtp = smtpConfigFromEnv();
    if (!smtp) return false;
    const sent = sendSmtp(smtp, { to: ALERT_TO, ...requestDoorAlert(door) }).then((r) => r.status === "sent");
    const late = new Promise<boolean>((done) => setTimeout(() => done(false), ALERT_WAIT_MS));
    return await Promise.race([sent, late]);
  } catch {
    return false;
  }
}

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
  console.info("[request-door] stored", { door, alerted: await alertTeam(door) });
  return "received";
}
