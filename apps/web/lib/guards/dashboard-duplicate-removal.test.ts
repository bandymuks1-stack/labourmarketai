import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPINE_SIGNALS } from "@/lib/notifications/spine-signals";
import { DASHBOARD_MODULES } from "@/lib/dashboard/dashboard-module-registry";

/**
 * Dashboard Duplicate Removal v1 guard (Wave 3, owner-approved scope).
 *
 * D-01 removed the worker home's repeated pending-card block; W3 Package 4
 * then deleted the whole second dashboard the cards lived on, so the
 * page-level "renders exactly once" pins left with it. What must survive
 * that deletion is the owner's terminal condition itself:
 *
 *  1. EVERY PENDING ACTION KEEPS ONE ENTRY POINT — the spine signals the
 *     removed cards relied on still exist with real clearing hrefs, and
 *     the invitation capability resolves where its href points.
 *  2. PROVENANCE + JOURNAL REACHABLE — the intelligence surface keeps its
 *     explainability drawer; the journal module door stays registered.
 *  3. D-02 / D-03 NOT REMOVED — evaluated against the owner criteria and
 *     kept (see docs/audit/dashboard-duplicate-removal-v1.md); the trust
 *     card and the reports count-summary stay.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

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
    // The top-slot ladder was deleted with the second dashboard (W3
    // Package 4); the capability lives in the panel's work context instead.
    expect(read("lib/world-state/work-context-server.ts")).toMatch(
      /listMyPendingWorkerInvitations/,
    );
    expect(read("components/app/world-state/context-panel.tsx")).toMatch(
      /<WorkerInvitations\b/,
    );
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
