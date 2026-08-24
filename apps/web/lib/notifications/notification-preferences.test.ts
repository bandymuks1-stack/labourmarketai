import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_CHANNEL_DEFAULTS,
  readNotificationPreferencesFor,
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
  const selectResult = opts.selectResult ?? { data: [], error: null };
  return {
    from() {
      return {
        // reader chains .select(...).eq("profile_id", id)
        select: () => ({ eq: () => Promise.resolve(selectResult) }),
        upsert: () => Promise.resolve(opts.upsertResult ?? { error: null }),
      };
    },
  } as never;
}

describe("readNotificationPreferencesFor", () => {
  it("maps rows and drops any row with an unknown channel", async () => {
    const r = await readNotificationPreferencesFor(
      fakeClient({
        selectResult: {
          data: [
            { notification_type: "weekly_digest", channel: "email", enabled: true },
            { notification_type: "x", channel: "sms", enabled: true }, // unknown channel → dropped
          ],
          error: null,
        },
      }),
      "p1",
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.rows).toEqual([
        { notificationType: "weekly_digest", channel: "email", enabled: true },
      ]);
    }
  });

  it("a missing table degrades to feature_unavailable, never throws", async () => {
    const r = await readNotificationPreferencesFor(
      fakeClient({ selectResult: { data: null, error: { code: "42P01" } } }),
      "p1",
    );
    expect(r.kind).toBe("feature_unavailable");
  });

  it("always filters by the given profile id (safe under service-role too)", async () => {
    // The fake asserts .eq is the terminal call; a reader that forgot the
    // filter would call .select() and await it directly, throwing here.
    let eqArg: unknown = null;
    const client = {
      from: () => ({
        select: () => ({
          eq: (_col: string, id: string) => {
            eqArg = id;
            return Promise.resolve({ data: [], error: null });
          },
        }),
      }),
    } as never;
    await readNotificationPreferencesFor(client, "profile-42");
    expect(eqArg).toBe("profile-42");
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
