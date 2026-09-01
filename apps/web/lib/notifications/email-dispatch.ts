import "server-only";

/**
 * NOTIFICATION EMAIL DISPATCHER (completion v1) — the M6 closure half that
 * needs NO credentials to exist: the code path from "a durable event was
 * written" to "the recipient's inbox", inert until the owner configures a
 * real provider.
 *
 * DESIGN INTENT, stated for the future reader: the moment the owner sets
 * INVITE_EMAIL_PROVIDER / INVITE_EMAIL_API_KEY / INVITE_EMAIL_FROM to a real
 * provider, notification emails start flowing WITHOUT any further code
 * change — every gate below is env- or data-driven, none is a feature flag
 * someone must remember to flip.
 *
 * CONSENT-FIRST (migration 20260823160000 §4, binding): email defaults OFF.
 * An email goes out ONLY where the recipient stored an explicit
 * (type, email, enabled=true) preference row — `resolveChannelEnabled`
 * returns the channel default (false) otherwise. Never flip that.
 *
 * ORDER OF GATES (each produces a distinct tagged outcome — a silent skip
 * indistinguishable from success is the exact failure mode that hid the dead
 * interest emitter for weeks):
 *   1. recipient opted in for this type          → else `channel_disabled`
 *   2. adapter path active (real provider, or the dev/test log provider)
 *                                                → else `not_configured`
 *   3. recipient has a profiles.email row        → else `no_recipient_email`
 *      (NEVER email an address we do not hold — skip silently, tagged)
 *   4. catalogue can name the event              → else `render_failed`
 *   5. provider acknowledged                     → `sent` / `logged` /
 *                                                  `send_failed`
 *
 * The profiles.email read runs on the SAME service-role client the durable
 * insert used (profile_email_identity_binding_v1 keeps that column
 * non-authoritative for identity — here it is a delivery address only).
 * Never throws: an email is an enhancement of a notification that already
 * durably exists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isTransactionalEmailPathActive,
  sendTransactionalEmail,
} from "@/lib/email/transactional";
import { renderNotificationEmail } from "@/lib/email/notification-email";
import {
  resolveChannelEnabled,
  type NotificationPreferenceRow,
} from "./notification-preferences";
import type { NotificationEventInput } from "./events";

type DbClient = Pick<SupabaseClient, "from">;

/**
 * Types with NO email hop in v1: `document_expiring` is emitted only on the
 * detached read-time paths (which insert directly, without the dispatcher),
 * so offering an email toggle for it would promise a send that cannot
 * happen. The settings surface hides the email column for these — honesty
 * over symmetry. Everything else reaches the dispatcher via the awaited
 * `deliver` helper (or the demand-interest emitters' own dispatch call).
 */
export const NOTIFICATION_EMAIL_INCAPABLE_TYPES: readonly string[] = [
  "document_expiring",
];

export type NotificationEmailDispatchOutcome =
  | { readonly kind: "sent" }
  /** Dev/test log provider: path exercised, nothing left the machine. */
  | { readonly kind: "logged" }
  | { readonly kind: "channel_disabled" }
  | { readonly kind: "not_configured" }
  | { readonly kind: "no_recipient_email" }
  | { readonly kind: "render_failed" }
  | { readonly kind: "send_failed"; readonly reason: string };

/** Greppable marker for a REAL send failure (provider refused / transport
 *  died). Reason code only — never the address, never content. */
export const NOTIFICATION_EMAIL_FAILED = "[notifications/email] send failed";

export async function maybeDispatchNotificationEmail(
  admin: DbClient,
  input: Pick<
    NotificationEventInput,
    "recipientProfileId" | "eventType" | "entityType"
  >,
  prefRows: readonly NotificationPreferenceRow[],
): Promise<NotificationEmailDispatchOutcome> {
  try {
    // 1. Explicit opt-in only (email channel default is OFF).
    if (!resolveChannelEnabled(prefRows, input.eventType, "email")) {
      return { kind: "channel_disabled" };
    }

    // 2. Inert until the owner configures delivery (or tests use `log`).
    if (!isTransactionalEmailPathActive()) {
      return { kind: "not_configured" };
    }

    // 3. Recipient address — service-role read beside the insert that just
    // ran. No row / no value → tagged skip, never a guessed address.
    const { data, error } = await admin
      .from("profiles")
      .select("email")
      .eq("id", input.recipientProfileId)
      .maybeSingle();
    const email =
      !error && data ? ((data as { email?: string | null }).email ?? null) : null;
    if (!email || !email.includes("@")) {
      return { kind: "no_recipient_email" };
    }

    // 4. Same copy as the bell, absolute canonical-origin deep link.
    const rendered = await renderNotificationEmail({
      eventType: input.eventType,
      entityType: input.entityType,
    });
    if (!rendered) return { kind: "render_failed" };

    // 5. Truthful adapter outcome — "sent" only on a provider 2xx.
    const result = await sendTransactionalEmail({
      to: email,
      subject: rendered.subject,
      text: rendered.text,
    });
    if (result.status === "sent") return { kind: "sent" };
    if (result.status === "logged") {
      // The log provider's entire purpose: show the rendered email in the
      // server log so the path is verifiable without vendor keys. Subject +
      // link only — never the recipient address.
      console.info(
        "[notifications/email] LOGGED (no send)",
        { eventType: input.eventType, subject: rendered.subject, deepLink: rendered.deepLink },
      );
      return { kind: "logged" };
    }
    if (result.status === "not_configured") return { kind: "not_configured" };
    console.warn(NOTIFICATION_EMAIL_FAILED, {
      eventType: input.eventType,
      reason: result.reason,
    });
    return { kind: "send_failed", reason: result.reason };
  } catch {
    // An email must never take the notification (or the domain write above
    // it) down with it.
    return { kind: "send_failed", reason: "thrown" };
  }
}
