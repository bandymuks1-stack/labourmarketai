import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * ROUTE TRUTH MAP (full-project consolidation 2026-07-02).
 *
 * Every dashboard route is deliberately classified. Adding a page without
 * classifying it here FAILS the suite — no more accidental surface drift
 * (the audit found 84 pages with overlapping worlds; this ratchet keeps the
 * map honest from now on).
 *
 * Classes:
 *   REAL_LAUNCH_SURFACE — part of the launch product; may appear in nav.
 *   INTERNAL_ADMIN      — superadmin-gated internal tooling.
 *   GATED_PREVIEW       — parked/preview; guard-enforced zero inbound links
 *                         (see preview-surfaces-unlinked.test.ts).
 *   DUPLICATE_DRIFT     — known overlap kept temporarily; consolidation is
 *                         tracked in the audit backlog. Must NOT grow.
 *   REDIRECT_STUB       — bookmark-preserving redirect only.
 */

const CLASSIFICATION: Record<string, string> = {
  // ── REAL_LAUNCH_SURFACE ────────────────────────────────────────────────
  "dashboard": "REAL_LAUNCH_SURFACE",
  "dashboard/account": "REAL_LAUNCH_SURFACE",
  "dashboard/bookings": "REAL_LAUNCH_SURFACE",
  "dashboard/candidates": "REAL_LAUNCH_SURFACE",
  "dashboard/communication": "REAL_LAUNCH_SURFACE",
  "dashboard/communication/[conversationId]": "REAL_LAUNCH_SURFACE",
  "dashboard/company": "REAL_LAUNCH_SURFACE",
  "dashboard/company/projects/new": "REAL_LAUNCH_SURFACE",
  "dashboard/company/scouting": "REAL_LAUNCH_SURFACE",
  "dashboard/documents": "REAL_LAUNCH_SURFACE",
  "dashboard/inbox": "REAL_LAUNCH_SURFACE",
  "dashboard/inbox/quick": "REAL_LAUNCH_SURFACE",
  "dashboard/inbox/report": "REAL_LAUNCH_SURFACE",
  "dashboard/journal": "REAL_LAUNCH_SURFACE",
  "dashboard/market-map": "REAL_LAUNCH_SURFACE",
  "dashboard/opportunities": "REAL_LAUNCH_SURFACE",
  "dashboard/profile": "REAL_LAUNCH_SURFACE",
  "dashboard/projects": "REAL_LAUNCH_SURFACE",
  "dashboard/projects/[id]": "REAL_LAUNCH_SURFACE",
  "dashboard/projects/[id]/operations": "REAL_LAUNCH_SURFACE",
  "dashboard/service-requests": "REAL_LAUNCH_SURFACE",
  "dashboard/services": "REAL_LAUNCH_SURFACE",
  "dashboard/start": "REAL_LAUNCH_SURFACE",
  "dashboard/start/company": "REAL_LAUNCH_SURFACE",
  "dashboard/instructions": "REAL_LAUNCH_SURFACE",
  "dashboard/reports/evidence": "REAL_LAUNCH_SURFACE",

  // ── INTERNAL_ADMIN (all under requireSuperadmin, fail-closed) ─────────
  "dashboard/admin": "INTERNAL_ADMIN",
  "dashboard/admin/agent-os": "INTERNAL_ADMIN",
  "dashboard/admin/billing": "INTERNAL_ADMIN",
  "dashboard/admin/candidate-pool": "INTERNAL_ADMIN",
  "dashboard/admin/company-verification": "INTERNAL_ADMIN",
  "dashboard/admin/language-feedback": "INTERNAL_ADMIN",
  "dashboard/admin/league": "INTERNAL_ADMIN",
  "dashboard/admin/market": "INTERNAL_ADMIN",
  "dashboard/admin/matching": "INTERNAL_ADMIN",
  "dashboard/admin/need-structuring": "INTERNAL_ADMIN",
  "dashboard/admin/project-truth": "INTERNAL_ADMIN",
  "dashboard/admin/readiness": "INTERNAL_ADMIN",
  "dashboard/admin/support": "INTERNAL_ADMIN",
  "dashboard/admin/telemetry": "INTERNAL_ADMIN",
  "dashboard/admin/users/[id]": "INTERNAL_ADMIN",

  // ── GATED_PREVIEW (guard-enforced zero inbound links) ─────────────────
  "dashboard/talent": "GATED_PREVIEW",
  "dashboard/visual-os": "GATED_PREVIEW",
  "dashboard/visual-os/agency": "GATED_PREVIEW",
  "dashboard/learning": "GATED_PREVIEW", // parked pending owner entry-point decision (F-N1)

  // ── DUPLICATE_DRIFT (kept temporarily; consolidation in backlog) ──────
  // Buyer rooms overlap the canonical company workspace (F-D4); search is
  // an unlinked router page; market/recognize overlaps journal
  // recognition. This list must SHRINK, never grow. The agency trio was
  // consolidated 2026-07-05 (Direction A): agency = company_type
  // 'staffing_agency' inside the canonical company workspace, and the
  // legacy routes became redirect stubs below.
  "dashboard/buyer": "DUPLICATE_DRIFT",
  "dashboard/start/buyer": "DUPLICATE_DRIFT",
  "dashboard/search": "DUPLICATE_DRIFT",
  "dashboard/market/recognize": "DUPLICATE_DRIFT",
  "dashboard/marketplace": "REDIRECT_STUB",
  "dashboard/player-card": "REDIRECT_STUB",
  "dashboard/agency": "REDIRECT_STUB",
  "dashboard/agency/pool": "REDIRECT_STUB",
  "dashboard/start/agency": "REDIRECT_STUB",
};

const APP_DIR = join(process.cwd(), "app", "[locale]");

function findPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) findPages(p, acc);
    else if (entry === "page.tsx") acc.push(p);
  }
  return acc;
}

const dashboardPages = findPages(join(APP_DIR, "dashboard")).map((p) =>
  relative(APP_DIR, p).split(sep).slice(0, -1).join("/"),
);

describe("route truth map — every dashboard route is deliberately classified", () => {
  it("no unclassified dashboard route exists", () => {
    const unclassified = dashboardPages.filter((r) => !(r in CLASSIFICATION));
    expect(
      unclassified,
      "New dashboard route(s) without a truth-map class — classify them in route-truth-map.test.ts",
    ).toEqual([]);
  });

  it("no classified route has silently disappeared without map cleanup", () => {
    const gone = Object.keys(CLASSIFICATION).filter(
      (r) => !dashboardPages.includes(r),
    );
    expect(gone, "Routes in the map but not on disk — prune the map").toEqual([]);
  });

  it("DUPLICATE_DRIFT never grows past the audited set", () => {
    // Ratchet history: 7 (2026-07-02 audit) → 4 (2026-07-05, agency trio
    // reclassified REDIRECT_STUB under Direction A). The cap only shrinks.
    const drift = Object.values(CLASSIFICATION).filter(
      (v) => v === "DUPLICATE_DRIFT",
    ).length;
    expect(drift).toBeLessThanOrEqual(4);
  });

  it("primary nav exposes only REAL_LAUNCH_SURFACE routes", () => {
    // The nav catalogue is pinned separately (preview-surfaces-unlinked,
    // navigation guards); here we assert the four primary tabs' targets are
    // all classified REAL_LAUNCH_SURFACE.
    for (const target of [
      "dashboard",
      "dashboard/market-map",
      "dashboard/journal",
      "dashboard/communication",
    ]) {
      expect(CLASSIFICATION[target]).toBe("REAL_LAUNCH_SURFACE");
    }
  });
});
