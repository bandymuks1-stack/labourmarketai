import { createECDH } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/notification-email", () => ({
  renderNotificationEmail: vi.fn(async () => ({
    subject: "New message",
    text: "unused",
    deepLink: "https://labourmarket.ai/lt/dashboard/inbox",
  })),
}));

import { webPushClientConfig, webPushStatus } from "./web-push-config";
import { maybeDispatchWebPush } from "./web-push-dispatch";
import { PUSH_OPT_IN_TYPE, resolvePushOptIn, type NotificationPreferenceRow } from "./notification-preferences";

const vapid = createECDH("prime256v1");
vapid.generateKeys();
const ENV_ON = {
  WEB_PUSH_ENABLED: "true",
  WEB_PUSH_VAPID_PUBLIC_KEY: vapid.getPublicKey().toString("base64url"),
  WEB_PUSH_VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString("base64url"),
  WEB_PUSH_VAPID_SUBJECT: "mailto:ops@example.com",
};
const ua = createECDH("prime256v1");
ua.generateKeys();
const SUB = {
  id: "s1",
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: ua.getPublicKey().toString("base64url"),
  auth: Buffer.alloc(16, 3).toString("base64url"),
};
const OPTED_IN: NotificationPreferenceRow[] = [{ notificationType: PUSH_OPT_IN_TYPE, channel: "push", enabled: true }];
const INPUT = { recipientProfileId: "p1", eventType: "message_received", entityType: "conversation", metadata: {} } as const;

/** A tiny stand-in for the service-role client: records deletes, answers selects. */
function fakeAdmin(subs: unknown[]) {
  const deleted: string[] = [];
  const admin = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => {
          if (mode === "delete") deleted.push(v);
          return q;
        },
        limit: async () => ({ data: table === "web_push_subscriptions" ? subs : [], error: null }),
        maybeSingle: async () => ({ data: { locale: "lt" }, error: null }),
        delete: () => {
          mode = "delete";
          return q;
        },
      };
      let mode: "read" | "delete" = "read";
      return q;
    },
  };
  return { admin: admin as never, deleted };
}

describe("web push config — OFF unless every part is present", () => {
  it("is off by default and names what is missing (never a value)", () => {
    const s = webPushStatus({});
    expect(s.active).toBe(false);
    expect(s.active ? [] : s.missing).toEqual([
      "WEB_PUSH_ENABLED",
      "WEB_PUSH_VAPID_PUBLIC_KEY",
      "WEB_PUSH_VAPID_PRIVATE_KEY",
      "WEB_PUSH_VAPID_SUBJECT",
    ]);
  });

  it("the flag alone does nothing; keys alone do nothing", () => {
    expect(webPushStatus({ WEB_PUSH_ENABLED: "true" }).active).toBe(false);
    expect(webPushStatus({ ...ENV_ON, WEB_PUSH_ENABLED: "1" }).active).toBe(false);
    expect(webPushStatus({ ...ENV_ON, WEB_PUSH_VAPID_PRIVATE_KEY: "short" }).active).toBe(false);
    expect(webPushStatus(ENV_ON).active).toBe(true);
  });

  it("the page learns only the public key", () => {
    const c = webPushClientConfig(ENV_ON);
    expect(c).toEqual({ active: true, publicKey: ENV_ON.WEB_PUSH_VAPID_PUBLIC_KEY });
    expect(JSON.stringify(c)).not.toContain(ENV_ON.WEB_PUSH_VAPID_PRIVATE_KEY);
    expect(webPushClientConfig({})).toEqual({ active: false, publicKey: null });
  });
});

describe("the opt-in lives with the notification preferences", () => {
  it("default OFF; only the explicit '*'/push row turns it on", () => {
    expect(resolvePushOptIn([])).toBe(false);
    expect(resolvePushOptIn(OPTED_IN)).toBe(true);
    expect(resolvePushOptIn([{ notificationType: PUSH_OPT_IN_TYPE, channel: "push", enabled: false }])).toBe(false);
    expect(resolvePushOptIn([{ notificationType: "message_received", channel: "push", enabled: true }])).toBe(false);
  });
});

describe("maybeDispatchWebPush — gates in order, each named", () => {
  it("not_configured while the flag is off — nothing is read or sent", async () => {
    const fetchImpl = vi.fn();
    const { admin } = fakeAdmin([SUB]);
    expect(await maybeDispatchWebPush(admin, INPUT, OPTED_IN, { env: {}, fetchImpl })).toEqual({ kind: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("channel_disabled without the person's opt-in", async () => {
    const fetchImpl = vi.fn();
    const { admin } = fakeAdmin([SUB]);
    expect(await maybeDispatchWebPush(admin, INPUT, [], { env: ENV_ON, fetchImpl })).toEqual({ kind: "channel_disabled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("no_subscription when no device is subscribed (or only a non-push-service endpoint)", async () => {
    const fetchImpl = vi.fn();
    expect(await maybeDispatchWebPush(fakeAdmin([]).admin, INPUT, OPTED_IN, { env: ENV_ON, fetchImpl })).toEqual({ kind: "no_subscription" });
    const rogue = { ...SUB, endpoint: "https://169.254.169.254/latest" };
    expect(await maybeDispatchWebPush(fakeAdmin([rogue]).admin, INPUT, OPTED_IN, { env: ENV_ON, fetchImpl })).toEqual({ kind: "no_subscription" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends an encrypted, VAPID-signed message to the push service", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const out = await maybeDispatchWebPush(fakeAdmin([SUB]).admin, INPUT, OPTED_IN, { env: ENV_ON, fetchImpl: fetchImpl as never });
    expect(out).toEqual({ kind: "sent", devices: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SUB.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(headers.TTL).toBe("86400");
    // The body is ciphertext: the title is not readable on the wire.
    expect(Buffer.from(init.body as Uint8Array).toString("latin1")).not.toContain("New message");
  });

  it("a 410 from the push service deletes that subscription and nothing else", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 410 }));
    const { admin, deleted } = fakeAdmin([SUB]);
    const out = await maybeDispatchWebPush(admin, INPUT, OPTED_IN, { env: ENV_ON, fetchImpl: fetchImpl as never });
    expect(out).toEqual({ kind: "send_failed", reason: "gone" });
    expect(deleted).toEqual(["s1"]);
  });

  it("never throws — a transport failure is a tagged outcome", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const out = await maybeDispatchWebPush(fakeAdmin([SUB]).admin, INPUT, OPTED_IN, { env: ENV_ON, fetchImpl: fetchImpl as never });
    expect(out).toEqual({ kind: "send_failed", reason: "transport" });
  });
});
