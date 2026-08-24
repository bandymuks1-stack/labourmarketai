import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_CHANNEL_DEFAULTS,
  readMyNotificationPreferences,
  resolveChannelEnabled,
  resolveEffectivePreferences,
  setNotificationPreference,
  type NotificationPreferenceRow,
} from "./notification-preferences";

describe("notification preference defaults (consent-first)", () => {
  it("email defaults OFF, in-app defaults ON — never silent email opt-in", () => {
    expect(NOTIFICATION_CHANNEL_DEFAULTS.email).toBe(false);
    expect(NOTIFICATION_CHANNEL_DEFAULTS.in_app).toBe(true);
  });

  it("with no stored rows, the channel default applies", () => {
    expect(resolveChannelEnabled([], "weekly_digest", "email")).toBe(false);
    expect(resolveChannelEnabled([], "weekly_digest", "in_app")).toBe(true);
  });

  it("an explicit row wins over the default, both directions", () => {
    const rows: NotificationPreferenceRow[] = [
      { notificationType: "weekly_digest", channel: "email", enabled: true },
      { notificationType: "weekly_digest", channel: "in_app", enabled: false },
    ];
    expect(resolveChannelEnabled(rows, "weekly_digest", "email")).toBe(true);
    expect(resolveChannelEnabled(rows, "weekly_digest", "in_app")).toBe(false);
  });

  it("resolveEffectivePreferences maps each type across both channels", () => {
    const rows: NotificationPreferenceRow[] = [
      { notificationType: "weekly_digest", channel: "email", enabled: true },
    ];
    const eff = resolveEffectivePreferences(rows, [
      "weekly_digest",
      "booking_proposed",
    ]);
    expect(eff).toEqual([
      { notificationType: "weekly_digest", channels: { in_app: true, email: true } },
      { notificationType: "booking_proposed", channels: { in_app: true, email: false } },
    ]);
  });
});

/** Minimal fake matching the two calls the helpers make. */
function fakeClient(opts: {
  selectResult?: { data: unknown; error: { code?: string } | null };
  upsertResult?: { error: { code?: string } | null };
}) {
  return {
    from() {
      return {
        select: () => Promise.resolve(opts.selectResult ?? { data: [], error: null }),
        upsert: () => Promise.resolve(opts.upsertResult ?? { error: null }),
      };
    },
  } as never;
}

describe("readMyNotificationPreferences", () => {
  it("maps rows and drops any row with an unknown channel", async () => {
    const r = await readMyNotificationPreferences(
      fakeClient({
        selectResult: {
          data: [
            { notification_type: "weekly_digest", channel: "email", enabled: true },
            { notification_type: "x", channel: "sms", enabled: true }, // unknown channel → dropped
          ],
          error: null,
        },
      }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.rows).toEqual([
        { notificationType: "weekly_digest", channel: "email", enabled: true },
      ]);
    }
  });

  it("a missing table degrades to feature_unavailable, never throws", async () => {
    const r = await readMyNotificationPreferences(
      fakeClient({ selectResult: { data: null, error: { code: "42P01" } } }),
    );
    expect(r.kind).toBe("feature_unavailable");
  });
});

describe("setNotificationPreference", () => {
  const base = { profileId: "p1", channel: "email" as const, enabled: true };

  it("rejects an empty or over-long type", async () => {
    expect(
      (await setNotificationPreference(fakeClient({}), { ...base, notificationType: "" })).kind,
    ).toBe("invalid");
    expect(
      (
        await setNotificationPreference(fakeClient({}), {
          ...base,
          notificationType: "x".repeat(65),
        })
      ).kind,
    ).toBe("invalid");
  });

  it("upserts a valid preference", async () => {
    const r = await setNotificationPreference(fakeClient({}), {
      ...base,
      notificationType: "weekly_digest",
    });
    expect(r.kind).toBe("ok");
  });
});
