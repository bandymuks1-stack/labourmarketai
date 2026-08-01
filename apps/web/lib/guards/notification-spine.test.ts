import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SPINE_SIGNALS,
  buildSpineNotifications,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import { activeLocales } from "@/lib/i18n/config";

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
  openTaskAttention: 0,
  newJobMatches: 0,
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
      openTaskAttention: 7,
      newJobMatches: 8,
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

describe("signal catalogue integrity", () => {
  it("signal ids are unique (each row is one addressable testid)", () => {
    const ids = SPINE_SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("signal types are unique (each row maps to its own i18n leaf)", () => {
    const types = SPINE_SIGNALS.map((s) => s.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("every spine count feeds at least one visible signal — no orphan loads", () => {
    // getSpineCounts() pays a query for every field; a count that no signal
    // consumes is silent dead weight (or a signal someone forgot to wire).
    for (const key of Object.keys(ZERO) as (keyof SpineCounts)[]) {
      const rows = buildSpineNotifications({ ...ZERO, [key]: 1 }, "worker");
      expect(
        rows.length,
        `SpineCounts.${key} is loaded but no catalogue signal renders it`,
      ).toBeGreaterThan(0);
    }
  });

  it("every signal routes inside the authenticated dashboard shell", () => {
    // A bell row that lands on a public/marketing page could never clear —
    // the seen/read models all live behind auth.
    for (const s of SPINE_SIGNALS) {
      expect(s.href, s.id).toMatch(/^\/dashboard(\/|$)/);
    }
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
    // ...and that helper computes from the participant read model, not a
    // hardcoded or approximated value.
    const unread = read("lib/communication/unread.ts");
    expect(unread).toMatch(/getUnreadConversationCount/);
    expect(unread).toMatch(/last_read_at/);
  });

  it("MarkBookingsSeen actually stamps the booking_requests_seen writer", () => {
    // The page-level guard above proves the component MOUNTS; this proves the
    // component still CALLS the seen action (a gutted no-op component would
    // leave the bell count permanently stuck).
    const cmp = read("components/app/mark-bookings-seen.tsx");
    expect(cmp).toMatch(
      /import \{ markBookingRequestsSeen \} from "@\/lib\/booking\/booking-actions"/,
    );
    expect(cmp).toMatch(/markBookingRequestsSeen\(\)/);
    expect(read("lib/booking/booking-actions.ts")).toMatch(
      /markBookingRequestsSeen/,
    );
  });

  it("MarkServiceRequestsSeen actually stamps the request-loop seen model", () => {
    const cmp = read("components/app/mark-service-requests-seen.tsx");
    expect(cmp).toMatch(
      /import \{ markServiceRequestsSeen \} from "@\/lib\/marketplace\/service-requests"/,
    );
    expect(cmp).toMatch(/markServiceRequestsSeen\(\)/);
  });

  it("pending invitations clear on the SAME helper the spine counts", () => {
    // Signal href is /dashboard — the WORKSPACE. W3 row 6 moved the accept
    // surface there, into the Context Panel's work context, so the thing the
    // bell announces is both shown and resolvable at the href it points to.
    // Both ends are pinned: the same helper on both sides, and a real render.
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(
      /import \{ listMyPendingWorkerInvitations \} from "@\/lib\/worker\/invitations"/,
    );
    const workContext = read("lib/world-state/work-context-server.ts");
    expect(workContext).toMatch(/listMyPendingWorkerInvitations,?\s*$/m);
    expect(workContext).toMatch(/from "@\/lib\/worker\/invitations"/);
    expect(read("components/app/world-state/context-panel.tsx")).toMatch(
      /<WorkerInvitations\b/,
    );
    // The old second-dashboard home is gone entirely (W3 Package 4), so the
    // workspace context panel is the ONE home — no two-homes check needed.
  });
});

describe("bell, badges and layout consume the one spine source", () => {
  const LAYOUT = read("app/[locale]/dashboard/layout.tsx");
  const STREAM = read("components/app/spine-stream.tsx");
  const HYDRATOR = read("components/app/spine-hydrator.tsx");

  // P0 perf (2026-07-19): the spine no longer gates layout TTFB — it
  // STREAMS via <SpineStream> inside <Suspense> and hydrates the auth
  // context. The invariants below keep the original intent: ONE spine
  // source, derived (never hardcoded) notifications, a bell that is
  // never permanently empty, both nav surfaces badged from the spine.
  it("layout streams the spine inside the auth shell (never omits it)", () => {
    expect(LAYOUT).toMatch(/<Suspense fallback=\{null\}>\s*<SpineStream/);
    // The audit's original defect: a permanently-empty bell.
    expect(LAYOUT).not.toMatch(/notifications:\s*\[\]/);
  });

  it("the stream derives notifications + badges from the one spine source", () => {
    expect(STREAM).toMatch(/getSpineCounts\(\)/);
    expect(STREAM).toMatch(/buildSpineNotifications\(/);
    expect(STREAM).toMatch(/buildNavBadges\(spineCounts\)/);
    expect(HYDRATOR).toMatch(/applySpine\(notifications, badges\)/);
  });

  it("the header actually renders the bell", () => {
    expect(LAYOUT).toMatch(/<NotificationPanel \/>/);
  });

  it("BOTH nav surfaces (desktop tabs + mobile bottom nav) read the spine badges", () => {
    const tabs = read("components/app/dashboard-tabs.tsx");
    const bottom = read("components/app/bottom-nav.tsx");
    for (const src of [tabs, bottom]) {
      expect(src).toMatch(/badges: spineBadges \} = useAuth\(\)/);
      expect(src).toMatch(/badges = badges \?\? \(spineBadges/);
    }
  });

  it("nav badges carry ONLY tabs whose surface clears the signal", () => {
    // Doctrine (spine.ts): a badge that cannot clear is permanent noise.
    // Control room PR B generalized the derivation: a tab is badged ONLY
    // when a spine signal declares that tab's featureKey. Today exactly two
    // signals do — unread messages (clears by reading the thread) and
    // pending invitations (clears via the overview accept/decline card).
    // Adding another featureKey is a conscious catalogue change, so this
    // pin must be updated with it.
    const spine = read("lib/notifications/spine.ts");
    expect(spine).toMatch(/if \(!s\.featureKey\) continue;/);
    const badged = SPINE_SIGNALS.filter((s) => s.featureKey)
      .map((s) => `${s.id}→${s.featureKey}`)
      .sort();
    expect(badged).toEqual([
      "pending-invitations→overview",
      "unread-messages→communication",
    ]);
  });

  it("panel empty state renders localized copy, never a hardcoded string", () => {
    const panel = read("components/app/notification-panel.tsx");
    expect(panel).toMatch(/t\("emptyTitle"\)/);
    expect(panel).toMatch(/t\("emptyBody"\)/);
    // Unknown signal types fall back to the localized generic label — the
    // raw enum must never reach the user.
    expect(panel).toMatch(/tTypes\("generic"\)/);
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
  // Driven by the routing source of truth: promoting a locale to active
  // automatically extends this guard — no manual list to forget.
  for (const loc of activeLocales) {
    it(`${loc}: auth.notifications.types covers the whole catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: {
          notifications: {
            emptyTitle?: string;
            emptyBody?: string;
            types: Record<string, string>;
          };
        };
      };
      const types = msgs.auth.notifications.types;
      for (const s of SPINE_SIGNALS) {
        expect(
          types[s.type]?.trim().length,
          `${loc}: missing auth.notifications.types.${s.type}`,
        ).toBeGreaterThan(0);
      }
      // The panel's unknown-type fallback and empty state are copy too.
      expect(
        types.generic?.trim().length,
        `${loc}: missing auth.notifications.types.generic`,
      ).toBeGreaterThan(0);
      for (const key of ["emptyTitle", "emptyBody"] as const) {
        expect(
          msgs.auth.notifications[key]?.trim().length,
          `${loc}: missing auth.notifications.${key}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
