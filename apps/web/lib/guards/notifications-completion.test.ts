import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/events";
import { NOTIFICATION_EMAIL_INCAPABLE_TYPES } from "@/lib/notifications/email-dispatch";

/**
 * NOTIFICATIONS COMPLETION V1 — wiring guard.
 *
 * The slice closed three audit findings (M4 doc-stale, M5 preferences
 * unreachable, M6 no email channel) with code that is deliberately INERT
 * until owner env arrives. Inert code rots invisibly, so this guard pins the
 * wiring itself:
 *
 *  1. preference ENFORCEMENT lives in the emitters (deliver reads the
 *     recipient's rows fail-open, and the email hop runs only after a
 *     successful insert);
 *  2. the settings surface exists on /dashboard/account and speaks the
 *     bell's own type vocabulary;
 *  3. the per-row read persist is wired from the client context;
 *  4. the activity page renders the durable feed beside the derived spine;
 *  5. the weekly-digest cron exists in vercel.json AND refuses without
 *     CRON_SECRET (never an open trigger);
 *  6. every new copy key resolves in every ACTIVE locale.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("1. preference enforcement in the emitters", () => {
  const emitters = read("lib", "notifications", "event-emitters.ts");

  it("deliver() resolves the recipient's in-app preference before the insert, fail-open", () => {
    expect(emitters).toContain("readPrefRowsFailOpen");
    expect(emitters).toMatch(
      /resolveChannelEnabled\(prefRows, input\.eventType, "in_app"\)/,
    );
    // The fail-open contract is stated where it is implemented.
    expect(emitters).toMatch(/FAIL-OPEN|fail-open|FAILS OPEN/i);
  });

  it("the email hop runs only AFTER a successful durable insert", () => {
    const deliverBody = emitters.slice(
      emitters.indexOf("async function deliver("),
      emitters.indexOf("async function workerProfileId("),
    );
    const written = deliverBody.indexOf('outcome.kind === "written"');
    const dispatch = deliverBody.indexOf("maybeDispatchNotificationEmail");
    expect(written).toBeGreaterThan(0);
    expect(dispatch).toBeGreaterThan(written);
  });

  it("the cron sweep rides deliver (inherits preferences + email) and stays in the audited emitter home", () => {
    expect(emitters).toContain("emitWeeklyDigestNotificationsForCron");
    const cronBody = emitters.slice(
      emitters.indexOf("emitWeeklyDigestNotificationsForCron"),
    );
    expect(cronBody).toContain("await deliver(admin, {");
  });
});

describe("2. settings surface on /dashboard/account", () => {
  const page = read("app", "[locale]", "dashboard", "account", "page.tsx");

  it("renders the preferences section from the canonical type list", () => {
    expect(page).toContain("NotificationPreferencesSection");
    expect(page).toContain("NOTIFICATION_EVENT_TYPES");
    expect(page).toContain("resolveEffectivePreferences");
  });

  it("email honesty: delivery-active flag comes from the REAL-provider check", () => {
    expect(page).toMatch(
      /emailDeliveryActive=\{isTransactionalEmailConfigured\(\)\}/,
    );
  });

  it("types with no email dispatch path get no email toggle", () => {
    expect(page).toContain("NOTIFICATION_EMAIL_INCAPABLE_TYPES");
    // The v1 exclusion list is exactly the read-time-only type.
    expect([...NOTIFICATION_EMAIL_INCAPABLE_TYPES]).toEqual([
      "document_expiring",
    ]);
    for (const t of NOTIFICATION_EMAIL_INCAPABLE_TYPES) {
      expect(NOTIFICATION_EVENT_TYPES as readonly string[]).toContain(t);
    }
  });
});

describe("3. per-row read persist is wired", () => {
  it("the client context persists a durable row's read marker", () => {
    const ctx = read("lib", "auth", "context.tsx");
    expect(ctx).toContain("markNotificationEventReadAction");
    // Only durable rows persist — derived signals stay client-state only.
    expect(ctx).toMatch(/target\?\.durable/);
  });

  it("the bell panel marks a durable row read on click-through", () => {
    const panel = read("components", "app", "notification-panel.tsx");
    expect(panel).toMatch(/n\.durable \? \(\) => markAsRead\(n\.id\)/);
  });
});

describe("4. the activity page shows the durable feed", () => {
  const page = read("app", "[locale]", "dashboard", "activity", "page.tsx");

  it("reads the same durable source as the bell, with the page-sized limit", () => {
    expect(page).toContain("getDurableNotifications(100)");
    expect(page).toContain("activity-stored-events");
    expect(page).toContain("activity-stored-empty");
  });
});

describe("5. weekly-digest cron", () => {
  it("vercel.json schedules the sweep and keeps its existing keys", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      installCommand?: string;
      regions?: string[];
      crons?: { path: string; schedule: string }[];
    };
    expect(vercel.installCommand).toBeTruthy();
    expect(vercel.regions).toContain("dub1");
    const cron = (vercel.crons ?? []).find(
      (c) => c.path === "/api/cron/weekly-digest",
    );
    expect(cron).toBeTruthy();
    expect(cron!.schedule.trim().length).toBeGreaterThan(0);
  });

  it("the route refuses 401 while CRON_SECRET is unset — never an open trigger", () => {
    const route = read("app", "api", "cron", "weekly-digest", "route.ts");
    // The header parse lives in lib/api/cron-auth.ts (api-auth-boundary:
    // no route reads Authorization itself); the route only refuses.
    expect(route).toContain("authorizeCronRequest");
    expect(route).toMatch(/status: 401/);
    const auth = read("lib", "api", "cron-auth.ts");
    expect(auth).toContain("CRON_SECRET");
    expect(auth).toMatch(/if \(!secret\) return "not_configured";/);
    expect(auth).toMatch(/Bearer \$\{secret\}/);
  });
});

describe("6. new copy resolves in every ACTIVE locale", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (node, k) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[k]
            : undefined,
        msgs,
      );

  const KEYS = [
    "activityCentre.storedTitle",
    "activityCentre.storedIntro",
    "activityCentre.storedEmpty",
    "notificationPrefs.title",
    "notificationPrefs.intro",
    "notificationPrefs.inAppHeader",
    "notificationPrefs.emailHeader",
    "notificationPrefs.emailConsentNote",
    "notificationPrefs.emailInactiveNote",
    "notificationPrefs.error",
    "notificationPrefs.unavailable",
    "auth.notifications.email.open",
    "auth.notifications.email.manage",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: every completion-v1 key resolves non-empty`, () => {
      const msgs = JSON.parse(read("messages", `${loc}.json`)) as unknown;
      for (const key of KEYS) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
      // Every event type the settings surface lists has a bell label to
      // reuse — the settings page must never print a raw enum.
      for (const t of NOTIFICATION_EVENT_TYPES) {
        const v = resolve(msgs, `auth.notifications.types.event_${t}`);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: auth.notifications.types.event_${t}`,
        ).toBe(true);
      }
    });
  }
});
