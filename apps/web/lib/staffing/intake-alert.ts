import "server-only";

import { deliverPlatformEmail } from "@/lib/email/platform-email-delivery-store";

/**
 * ONE INTERNAL ALERT PER STORED NO-SIGNUP REQUEST (owner P0 2026-11-13), for both
 * anonymous paths: the three landing request doors and the /company-need form.
 *
 * The alert goes to the configured owner mailbox (LM_OWNER_NOTIFY_EMAIL) and says
 * only that a request of this type is waiting, with a link to the queue. NOTHING is
 * sent to the person who wrote the request, and nothing tells them when they will
 * be answered.
 *
 * The stored row's id is the event: an exact repeat within 24 h gets the same id
 * from the database, so it raises no second alert. The outcome is recorded
 * (lib/email/platform-email-delivery.ts); a failed send is retried by the sweep.
 *
 * The person is waiting for "received", so this returns after ALERT_WAIT_MS at the
 * latest; a slower send keeps running and still records its outcome. Never throws:
 * a failed alert cannot lose a stored request.
 */
const ALERT_WAIT_MS = 8000;

export type IntakeAlertResult = "sent" | "duplicate" | "pending" | "not_sent";

export async function notifyTeamOfStoredIntake(intakeId: string | null): Promise<IntakeAlertResult> {
  if (!intakeId) {
    // A stored row without an id cannot be keyed; say so rather than guess.
    console.warn("[intake-alert] stored request has no id; no alert raised");
    return "not_sent";
  }
  try {
    const delivery = deliverPlatformEmail({ kind: "intake_alert", subjectId: intakeId }).then((o): IntakeAlertResult =>
      o.outcome === "sent" || o.outcome === "sent_unrecorded" ? "sent" : o.outcome === "duplicate" ? "duplicate" : "not_sent",
    );
    const late = new Promise<IntakeAlertResult>((done) => setTimeout(() => done("pending"), ALERT_WAIT_MS));
    return await Promise.race([delivery, late]);
  } catch {
    return "not_sent";
  }
}
