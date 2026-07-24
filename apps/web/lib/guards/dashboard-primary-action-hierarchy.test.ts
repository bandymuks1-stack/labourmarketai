import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { decideTopSlot, type TopSlotSignals } from "@/lib/dashboard/top-slot";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Dashboard Primary Action Hierarchy v1 guard (Wave 4, owner-approved).
 *
 * The dashboard must make priority unmistakable: ONE dominant state-driven
 * primary action, compact secondary signals, one clear door to the
 * canonical time surface, and secondary hub content disclosed
 * progressively by REAL state. This guard pins:
 *
 *  1. one dominant primary-action region per branch;
 *  2. the top-slot priority ladder decides from real state (behavioral);
 *  3. the status strip carries the ONE calendar door to /dashboard/planning
 *     (a real route) — the dashboard never grows its own time projection;
 *  4. contextual hub: company/project cards render in the primary hub
 *     exactly when they have real data, and in the collapsed review section
 *     exactly otherwise — every door survives, none renders twice;
 *  5. the collapsed section stays a native <details> (keyboard-accessible
 *     without custom JS).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/advanced/page.tsx");
const WORKER = PAGE.slice(PAGE.indexOf("── Worker:"));
const ORG = PAGE.slice(
  PAGE.indexOf('if (role !== "worker")'),
  PAGE.indexOf("── Worker:"),
);
const HUB = read("components/app/premium-hub/premium-hub-screen.tsx");
const STRIP = read("components/app/dashboard/dashboard-status-strip.tsx");
const MORE = read("components/app/dashboard/dashboard-more-section.tsx");

function count(haystack: string, needle: string): number {
  let n = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    n++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return n;
}

describe("one dominant primary-action region per branch", () => {
  it("worker branch has exactly one top-slot region", () => {
    expect(count(WORKER, 'data-testid="dashboard-top-slot"')).toBe(1);
  });
  it("org branch has exactly one data-driven next action", () => {
    expect(count(ORG, "<DashboardNextAction")).toBe(1);
  });
});

describe("the top-slot ladder decides from real state (behavioral)", () => {
  const NONE: TopSlotSignals = {
    pendingInvitations: 0,
    acceptedOutgoing: 0,
    pendingIncomingServiceRequests: 0,
    pendingIncomingBookings: 0,
    bookingResponsesNew: 0,
    isFirstUse: false,
  };

  it("a pending invitation beats every other state", () => {
    expect(
      decideTopSlot({
        ...NONE,
        pendingInvitations: 1,
        acceptedOutgoing: 5,
        pendingIncomingBookings: 5,
        isFirstUse: true,
      }),
    ).toBe("invitation");
  });

  it("each rung wins only when every higher rung is empty", () => {
    expect(decideTopSlot({ ...NONE, acceptedOutgoing: 1 })).toBe("accepted_request");
    expect(decideTopSlot({ ...NONE, pendingIncomingServiceRequests: 1 })).toBe(
      "incoming_service_request",
    );
    expect(decideTopSlot({ ...NONE, pendingIncomingBookings: 1 })).toBe(
      "incoming_booking",
    );
    expect(decideTopSlot({ ...NONE, bookingResponsesNew: 1 })).toBe("booking_response");
  });

  it("no active state → activation is primary; a completed state never resurfaces a CTA", () => {
    expect(decideTopSlot({ ...NONE, isFirstUse: true })).toBe("new_user");
    expect(decideTopSlot(NONE)).toBeNull(); // nothing urgent → no fake urgency banner
  });
});

describe("one clear calendar door — Planning stays the canonical time surface", () => {
  it("the status strip links /dashboard/planning and the route exists", () => {
    expect(STRIP).toContain('href={"/dashboard/planning" as "/dashboard"}');
    expect(STRIP).toContain('data-testid="status-strip-calendar"');
    expect(
      existsSync(join(ROOT, "app", "[locale]", "dashboard", "planning", "page.tsx")),
    ).toBe(true);
  });

  it("the calendar label resolves in every active locale", () => {
    for (const locale of activeLocales) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      const label = msgs?.auth?.dashboard?.statusStrip?.calendar;
      expect(typeof label, locale).toBe("string");
      expect((label as string).length, locale).toBeGreaterThan(0);
    }
  });

  it("the dashboard grows no time projection of its own (no view builders)", () => {
    expect(PAGE).not.toMatch(/build(Agenda|MonthGrid|WeekView|YearOverview)/);
  });
});

describe("contextual hub — every card exactly once, placement by real state", () => {
  it("the hub's primary slot admits company/project cards only with real data", () => {
    expect(HUB).toContain('vm.company.status === "ready"');
    expect(HUB).toContain('vm.project.status === "ready"');
    expect(HUB).toMatch(/const showMap = !contextual/);
  });

  it("the worker page renders the hub contextually", () => {
    expect(WORKER).toContain(
      "<PremiumHubScreen vm={hubVm} embedded contextual workEditor={workEditor} />",
    );
  });

  it("the fold renders each secondary card under the EXACT inverse gate (none lost, none doubled)", () => {
    expect(WORKER).toContain('hubVm.company.status !== "ready"');
    expect(WORKER).toContain('hubVm.project.status !== "ready"');
    expect(count(WORKER, "<PremiumHubCompanyCard")).toBe(1);
    expect(count(WORKER, "<PremiumHubProjectCard")).toBe(1);
    expect(count(WORKER, "<PremiumHubMarketMap")).toBe(1);
  });

  it("the org branch hub stays untouched (full grid inside its fold)", () => {
    expect(ORG).toContain("<PremiumHubScreen vm={hubVm} embedded />");
    expect(ORG).not.toContain("contextual");
  });
});

describe("collapsed review content stays keyboard-accessible", () => {
  it("DashboardMoreSection is a native details/summary disclosure", () => {
    expect(MORE).toMatch(/<details/);
    expect(MORE).toMatch(/<summary/);
  });
});
