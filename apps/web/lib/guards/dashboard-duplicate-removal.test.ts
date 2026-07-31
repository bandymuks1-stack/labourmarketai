import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";
import { DASHBOARD_MODULES } from "@/lib/dashboard/dashboard-module-registry";

/**
 * Dashboard Duplicate Removal v1 guard (Wave 3, owner-approved scope).
 *
 * D-01 removed the worker home's repeated pending-card block. This guard
 * pins the owner's terminal conditions so a refactor cannot regress them:
 *
 *  1. NO DUPLICATE PENDING RENDERING — each pending card exists exactly
 *     once in the worker branch (as the top-slot candidate); the only
 *     below-hub card is the non-duplicate outgoing-requests card.
 *  2. EVERY PENDING ACTION KEEPS ONE ENTRY POINT — the spine signals the
 *     removed cards relied on still exist with real clearing hrefs, and the
 *     page derives its card counts FROM the same spineCounts (equivalence
 *     by construction, the D-01 proof).
 *  3. PROVENANCE + JOURNAL REACHABLE — the intelligence surface keeps its
 *     explainability drawer; the journal module door stays registered.
 *  4. D-02 / D-03 NOT REMOVED — evaluated against the owner criteria and
 *     kept (see docs/audit/dashboard-duplicate-removal-v1.md); the trust
 *     card and the reports count-summary stay.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/advanced/page.tsx");
const WORKER = PAGE.slice(PAGE.indexOf("── Worker:"));

function count(haystack: string, needle: string): number {
  let n = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    n++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return n;
}

describe("D-01 — no duplicate pending-card rendering on the worker home", () => {
  it("each removed card renders exactly once (the top-slot candidate)", () => {
    // W3 row 6: the invitation card is not a candidate any more — it is not
    // on this page at all. Zero, asserted, so a revert is visible.
    expect(count(WORKER, "<WorkerInvitationsCard")).toBe(0);
    expect(count(WORKER, "{bookingsPendingNextAction}")).toBe(0);
    expect(count(WORKER, "{serviceRequestsNextAction}")).toBe(0);
    expect(count(WORKER, "{bookingResponsesNextAction}")).toBe(0);
  });

  it("the non-duplicate outgoing card survives below the hub", () => {
    expect(
      count(WORKER, 'topSlot !== "accepted_request" && outgoingRequestsNextAction'),
    ).toBe(1);
  });

  it("the org branch card set is untouched (rendered once, no repeats there)", () => {
    const ORG = PAGE.slice(
      PAGE.indexOf('if (role !== "worker")'),
      PAGE.indexOf("── Worker:"),
    );
    for (const card of [
      "{serviceRequestsNextAction}",
      "{outgoingRequestsNextAction}",
      "{bookingResponsesNextAction}",
    ]) {
      expect(count(ORG, card), card).toBe(1);
    }
  });
});

describe("every pending action keeps one canonical entry point", () => {
  it("the spine still carries the removed cards' signals with real hrefs", () => {
    const byId = new Map(SPINE_SIGNALS.map((s) => [s.id, s]));
    expect(byId.get("pending-bookings")?.href).toBe("/dashboard/bookings");
    expect(byId.get("incoming-service-requests")?.href).toBe(
      "/dashboard/service-requests",
    );
    expect(byId.get("booking-responses")?.href).toBe("/dashboard/bookings");
    // invitations clear on the dashboard itself — and W3 row 6 is what makes
    // that href honest: /dashboard is the workspace, and the Context Panel
    // there both SHOWS the invitation and accepts it.
    expect(byId.get("pending-invitations")?.href).toBe("/dashboard");
  });

  it("the invitation signal resolves where its href points (row 6)", () => {
    const ladder = read("lib/dashboard/top-slot.ts");
    // The rung is gone from the ladder …
    expect(ladder).not.toMatch(/"invitation"/);
    // … because the capability is in the panel's work context instead.
    expect(read("lib/world-state/work-context-server.ts")).toMatch(
      /listMyPendingWorkerInvitations/,
    );
    expect(read("components/app/world-state/context-panel.tsx")).toMatch(
      /<WorkerInvitations\b/,
    );
  });

  it("card counts derive from the same spineCounts the chips use (equivalence by construction)", () => {
    expect(PAGE).toContain(
      "const pendingServiceRequests = spineCounts.pendingIncomingServiceRequests",
    );
    expect(PAGE).toContain(
      "const bookingResponsesNew = spineCounts.bookingResponsesNew",
    );
    expect(PAGE).toContain(
      "const pendingBookings = spineCounts.pendingIncomingBookings",
    );
  });

  it("the status strip renders on both branches (the chips' home)", () => {
    expect(count(PAGE, "<DashboardStatusStrip")).toBe(2);
  });
});

describe("D-02 / D-03 — kept surfaces stay reachable (no over-removal)", () => {
  it("intelligence provenance stays reachable on its canonical surface", () => {
    const intel = read("app/[locale]/dashboard/intelligence/page.tsx");
    expect(intel).toMatch(/IntelligenceCard/);
  });

  it("the journal module door stays registered", () => {
    expect(DASHBOARD_MODULES.some((m) => m.id === "journal")).toBe(true);
  });

  it("the reports count-summary keeps linking back to the canonical journal feed", () => {
    const reports = read("app/[locale]/dashboard/reports/page.tsx");
    expect(reports).toContain("/dashboard/journal");
  });
});
