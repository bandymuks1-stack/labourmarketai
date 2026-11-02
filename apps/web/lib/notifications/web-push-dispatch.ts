import "server-only";

/**
 * WEB PUSH DISPATCHER — the third hop of the ONE notification spine
 * (COM-3), beside the bell row and the e-mail hop. It never creates a
 * notification of its own: it runs only after `deliverDetailed` has written
 * the durable `notification_events` row, for the same recipient and the same
 * event, with the same copy and the same deep link as the bell and the
 * e-mail (`renderNotificationEmail` — one copy source).
 *
 * ORDER OF GATES — each a distinct tagged outcome, never a silent skip:
 *   1. the channel is switched on and fully configured  → else `not_configured`
 *   2. the person opted in (the `*`/`push` preference row; default OFF)
 *                                                       → else `channel_disabled`
 *   3. at least one subscribed device                   → else `no_subscription`
 *   4. the catalogue can name the event                 → else `render_failed`
 *   5. each push service's answer                       → `sent` (≥1 accepted)
 *                                                         or `send_failed`
 * The bell's own in-app preference has already been applied upstream: a type
 * the person silenced in the bell never reaches this hop, so push mirrors the
 * bell and needs no second per-type matrix.
 *
 * A push service answering 404/410 means the browser dropped the
 * subscription; that row is deleted (it can never deliver again). Nothing
 * else is deleted. Never throws: a push is an enhancement of a notification
 * that already durably exists.
 *
 * PRIVACY. The payload is the bell's TYPE title and the deep link — no
 * message text, no names. A lock screen shows "New message", not its
 * content.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { renderNotificationEmail } from "@/lib/email/notification-email";
import type { NotificationEventInput } from "./events";
import { resolvePushOptIn, type NotificationPreferenceRow } from "./notification-preferences";
import { webPushStatus } from "./web-push-config";
import {
  encryptWebPushPayload,
  isAllowedPushEndpoint,
  vapidAuthorization,
} from "./web-push-protocol";

type DbClient = Pick<SupabaseClient, "from">;

export type WebPushDispatchOutcome =
  | { readonly kind: "sent"; readonly devices: number }
  | { readonly kind: "not_configured" }
  | { readonly kind: "channel_disabled" }
  | { readonly kind: "no_subscription" }
  | { readonly kind: "render_failed" }
  | { readonly kind: "send_failed"; readonly reason: string };

/** Bounded fan-out: a person rarely has more than a phone and a laptop. */
const MAX_DEVICES = 10;
/** A notification older than a day is no longer news (push TTL, seconds). */
const PUSH_TTL_SECONDS = 24 * 60 * 60;

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

export async function maybeDispatchWebPush(
  admin: DbClient,
  input: Pick<NotificationEventInput, "recipientProfileId" | "eventType" | "entityType" | "metadata">,
  prefRows: readonly NotificationPreferenceRow[],
  deps: { readonly fetchImpl?: typeof fetch; readonly env?: Record<string, string | undefined> } = {},
): Promise<WebPushDispatchOutcome> {
  try {
    const config = webPushStatus(deps.env);
    if (!config.active) return { kind: "not_configured" };
    if (!resolvePushOptIn(prefRows)) return { kind: "channel_disabled" };

    const { data, error } = await admin
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", input.recipientProfileId)
      .limit(MAX_DEVICES);
    if (error) return { kind: "send_failed", reason: `read_${error.code ?? "unknown"}` };
    const subs = ((data ?? []) as SubscriptionRow[]).filter((s) => isAllowedPushEndpoint(s.endpoint));
    if (subs.length === 0) return { kind: "no_subscription" };

    const { data: profile } = await admin
      .from("profiles")
      .select("locale")
      .eq("id", input.recipientProfileId)
      .maybeSingle();
    const rendered = await renderNotificationEmail({
      eventType: input.eventType,
      entityType: input.entityType,
      locale: (profile as { locale?: string | null } | null)?.locale ?? undefined,
      metadata: input.metadata,
    });
    if (!rendered) return { kind: "render_failed" };
    const payload = Buffer.from(
      JSON.stringify({ title: rendered.subject, url: rendered.deepLink, tag: input.eventType }),
      "utf8",
    );

    const doFetch = deps.fetchImpl ?? fetch;
    let delivered = 0;
    let lastReason = "no_attempt";
    for (const sub of subs) {
      try {
        const body = encryptWebPushPayload(payload, { p256dh: sub.p256dh, auth: sub.auth });
        const res = await doFetch(sub.endpoint, {
          method: "POST",
          headers: {
            Authorization: vapidAuthorization({
              endpoint: sub.endpoint,
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            }),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(PUSH_TTL_SECONDS),
            Urgency: "normal",
          },
          body: new Uint8Array(body),
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status >= 200 && res.status < 300) {
          delivered++;
        } else if (res.status === 404 || res.status === 410) {
          // The browser unsubscribed; this row can never deliver again.
          await admin.from("web_push_subscriptions").delete().eq("id", sub.id);
          lastReason = "gone";
        } else {
          lastReason = `http_${res.status}`;
        }
      } catch {
        lastReason = "transport";
      }
    }
    if (delivered > 0) return { kind: "sent", devices: delivered };
    return { kind: "send_failed", reason: lastReason };
  } catch {
    return { kind: "send_failed", reason: "thrown" };
  }
}
