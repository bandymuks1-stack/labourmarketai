import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SPINE_SIGNALS,
  buildSpineNotifications,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";

/**
 * Notification spine guard (quality-train PR B).
 *
 * The bell must never become decorative chrome again (audit §5 YELLOW:
 * "notifications: [] hard-coded"). This guard pins the spine contract:
 * every signal is count-gated from a real per-surface model, every row
 * links a page that actually exists AND clears the signal on visit, the
 * bell/badges/layout all consume the one spine source, and every signal
 * type has copy in every served locale.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
};

describe("spine assembly is count-gated (never fabricates attention)", () => {
  it("all-zero counts produce an EMPTY bell — no fake rows", () => {
    expect(buildSpineNotifications(ZERO, "worker")).toEqual([]);
  });

  it("every catalogue signal renders exactly when its count is positive", () => {
    const all: SpineCounts = {
      unreadConversations: 1,
      pendingIncomingServiceRequests: 2,
      serviceRequestResponsesNew: 3,
      pendingIncomingBookings: 4,
      bookingResponsesNew: 5,
      pendingInvitations: 6,
    };
    const rows = buildSpineNotifications(all, "worker");
    expect(rows.map((r) => r.id).sort()).toEqual(
      SPINE_SIGNALS.map((s) => s.id).sort(),
    );
    // A derived signal without a real count or a clearing route is a lie.
    for (const row of rows) {
      expect(row.count, row.id).toBeGreaterThan(0);
      expect(row.href, row.id).toBeTruthy();
    }
  });

  it("pending invitations joined the spine (goal signal #6)", () => {
    const rows = buildSpineNotifications(
      { ...ZERO, pendingInvitations: 2 },
      "worker",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "pending-invitations",
      type: "pending_invitations",
      count: 2,
      href: "/dashboard",
    });
  });
});

describe("every spine row routes to a page that really exists", () => {
  for (const s of SPINE_SIGNALS) {
    it(`${s.id} → ${s.href}`, () => {
      const rel = join("app", "[locale]", ...s.href.split("/").filter(Boolean));
      expect(
        existsSync(join(ROOT, rel, "page.tsx")),
        `${s.href} must be a real page (${rel}/page.tsx)`,
      ).toBe(true);
    });
  }
});

describe("visiting the destination IS the read event", () => {
  it("bookings page marks booking responses seen on visit", () => {
    const page = read("app/[locale]/dashboard/bookings/page.tsx");
    expect(page).toMatch(/<MarkBookingsSeen \/>/);
  });

  it("service-requests page marks request responses seen on visit", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/<MarkServiceRequestsSeen \/>/);
  });

  it("booking-responses signal is backed by booking_requests_seen", () => {
    const lib = read("lib/booking/booking-actions.ts");
    // The count helper compares response timestamps against seen_at from
    // the production booking_requests_seen model — not a guess.
    expect(lib).toMatch(/getBookingResponsesNewCount/);
    expect(lib).toMatch(/booking_requests_seen/);
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(/getBookingResponsesNewCount\(\)/);
  });

  it("unread messages come from the ONE shared unread helper", () => {
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(
      /import \{ getUnreadConversationCount \} from "@\/lib\/communication\/unread"/,
    );
  });
});

describe("bell, badges and layout consume the one spine source", () => {
  const LAYOUT = read("app/[locale]/dashboard/layout.tsx");

  it("layout builds notifications from the spine — never a hardcoded list", () => {
    expect(LAYOUT).toMatch(/getSpineCounts\(\)/);
    expect(LAYOUT).toMatch(/buildSpineNotifications\(/);
    // The audit's original defect: a permanently-empty bell.
    expect(LAYOUT).not.toMatch(/notifications:\s*\[\]/);
  });

  it("nav badges derive from the same spine counts", () => {
    expect(LAYOUT).toMatch(/const navBadges = buildNavBadges\(spineCounts\)/);
  });

  it("the bell panel renders each signal as a LINK to its clearing surface", () => {
    const panel = read("components/app/notification-panel.tsx");
    expect(panel).toMatch(/n\.href \? \(/);
    expect(panel).toMatch(/notification-signal-\$\{n\.id\}/);
    // Unread state comes from the real rows, never a constant.
    expect(panel).toMatch(
      /const unread = notifications\.filter\(\(n\) => !n\.read_at\)\.length/,
    );
  });
});

describe("every spine signal type has copy in every served locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: auth.notifications.types covers the whole catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { notifications: { types: Record<string, string> } };
      };
      const types = msgs.auth.notifications.types;
      for (const s of SPINE_SIGNALS) {
        expect(
          types[s.type]?.trim().length,
          `${loc}: missing auth.notifications.types.${s.type}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
