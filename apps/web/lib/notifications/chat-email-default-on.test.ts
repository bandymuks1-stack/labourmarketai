import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationEmailLocale, renderNotificationEmail } from "@/lib/email/notification-email";
import { defaultLocale } from "@/lib/i18n/config";
import { maybeDispatchNotificationEmail } from "./email-dispatch";
import {
  NOTIFICATION_CHANNEL_DEFAULTS,
  NOTIFICATION_TYPE_EMAIL_DEFAULTS,
  resolveChannelEnabled,
  resolveEffectivePreferences,
} from "./notification-preferences";

/**
 * OWNER DECISION 2026-11-11: a new chat message is e-mailed BY DEFAULT, with
 * opt-out. What this pins:
 *   1. only `message_received` is default-on; the CHANNEL default stays OFF;
 *   2. a stored opt-out row always wins;
 *   3. an unreadable preference store never turns the default into a send
 *      (it could be hiding an opt-out) — e-mail fails closed;
 *   4. the settings surface shows the effective ON, so the opt-out is visible;
 *   5. the e-mail carries the bell subject and links only — never the message
 *      text or anyone's contact data;
 *   6. a stored but unrouted language gets English, never Lithuanian.
 * Recipients are the live participants only (#3224,
 * communication-core-revoked-no-alerts.test.ts).
 */

const RECIPIENT = "11111111-1111-4111-8111-111111111111";
const CONV = "44444444-4444-4444-8444-444444444444";
const INPUT = {
  recipientProfileId: RECIPIENT,
  eventType: "message_received",
  entityType: "conversation",
  metadata: { conversationId: CONV },
} as never;

function fakeAdmin() {
  const reads: string[] = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: { email: "person@example.com", locale: "en" }, error: null }),
  };
  return { reads, client: { from: (t: string) => (reads.push(t), chain) } as never };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("chat e-mail is on by default, with opt-out", () => {
  it("only message_received is default-on; the channel default stays OFF", () => {
    expect(NOTIFICATION_CHANNEL_DEFAULTS.email).toBe(false);
    expect(Object.keys(NOTIFICATION_TYPE_EMAIL_DEFAULTS)).toEqual(["message_received"]);
    expect(resolveChannelEnabled([], "message_received", "email")).toBe(true);
    expect(resolveChannelEnabled([], "booking_proposed", "email")).toBe(false);
    expect(resolveChannelEnabled([], "message_received", "in_app")).toBe(true);
  });

  it("a stored opt-out wins over the default", () => {
    expect(
      resolveChannelEnabled(
        [{ notificationType: "message_received", channel: "email", enabled: false }],
        "message_received",
        "email",
      ),
    ).toBe(false);
  });

  it("an unreadable preference store fails closed for e-mail", () => {
    expect(resolveChannelEnabled([], "message_received", "email", { rowsUnreadable: true })).toBe(false);
    // In-app keeps failing open: an outage must never kill the bell.
    expect(resolveChannelEnabled([], "message_received", "in_app", { rowsUnreadable: true })).toBe(true);
  });

  it("the settings surface shows the effective ON, so the person can turn it off", () => {
    expect(resolveEffectivePreferences([], ["message_received"])).toEqual([
      { notificationType: "message_received", channels: { in_app: true, email: true } },
    ]);
  });

  it("dispatcher: no row → the e-mail path is open (reaches the provider gate)", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "");
    const { client } = fakeAdmin();
    expect(await maybeDispatchNotificationEmail(client, INPUT, [])).toEqual({ kind: "not_configured" });
  });

  it("dispatcher: opt-out row → channel_disabled, no profile read", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const { client, reads } = fakeAdmin();
    const out = await maybeDispatchNotificationEmail(client, INPUT, [
      { notificationType: "message_received", channel: "email", enabled: false },
    ]);
    expect(out).toEqual({ kind: "channel_disabled" });
    expect(reads).toEqual([]);
  });

  it("dispatcher: unreadable preferences → channel_disabled, no profile read", async () => {
    vi.stubEnv("INVITE_EMAIL_PROVIDER", "log");
    const { client, reads } = fakeAdmin();
    const out = await maybeDispatchNotificationEmail(client, INPUT, [], { preferencesUnreadable: true });
    expect(out).toEqual({ kind: "channel_disabled" });
    expect(reads).toEqual([]);
  });
});

describe("the chat e-mail says nothing sensitive", () => {
  it("subject + a link to the thread + the settings link, nothing else", async () => {
    const r = await renderNotificationEmail({
      eventType: "message_received",
      entityType: "conversation",
      locale: "en",
      metadata: { conversationId: CONV },
    });
    expect(r).not.toBeNull();
    const lines = r!.text.split("\n").filter((l) => l.trim().length > 0);
    expect(lines[0]).toBe(r!.subject);
    expect(lines).toHaveLength(3);
    expect(r!.text).toContain("/en/dashboard/account");
    expect(r!.text).not.toMatch(/@/);
  });
});

describe("e-mail language", () => {
  it("a routed locale is kept", () => {
    expect(notificationEmailLocale("lt")).toBe("lt");
    expect(notificationEmailLocale("en-GB")).toBe("en");
  });

  it("a stored but unrouted language gets English, not Lithuanian", () => {
    expect(notificationEmailLocale("da")).toBe("en");
    expect(notificationEmailLocale("fi")).toBe("en");
  });

  it("no stored locale keeps the platform default", () => {
    expect(notificationEmailLocale(null)).toBe(defaultLocale);
    expect(notificationEmailLocale("")).toBe(defaultLocale);
  });
});
