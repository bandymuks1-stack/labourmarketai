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
  // Workforce leave & absence (Wagon 7) — worker requests + real manager
  // approval over the new worker_absences store; honest degradation pre-apply.
  "dashboard/absences": "REAL_LAUNCH_SURFACE",
  // Assets & logistics (Wagon 9) — org asset registry + issue/acknowledge/
  // transfer/return lifecycle over the new assets/asset_assignments stores.
  "dashboard/assets": "REAL_LAUNCH_SURFACE",
  // Commercial CRM (Wagon 10) — owner-scoped proposals + contracts; invoices/
  // payments link to the canonical finance layer (not duplicated).
  "dashboard/commercial": "REAL_LAUNCH_SURFACE",
  "dashboard/account": "REAL_LAUNCH_SURFACE",
  // Unified activity centre (control room PR C) — spine-only aggregation.
  "dashboard/activity": "REAL_LAUNCH_SURFACE",
  // AI assistance centre (control room PR J) — deterministic attention +
  // summaries over existing RLS reads, plus the HONEST provider state card.
  // No generation is wired (provider unconfigured + audit store gated).
  "dashboard/advanced": "REAL_LAUNCH_SURFACE",
  "dashboard/assist": "REAL_LAUNCH_SURFACE",
  // Rebuild W5: /dashboard/assistant has been a pure redirect to /dashboard
  // since the chat-first home landed (PR #864) — classified by what it IS.
  "dashboard/bookings": "REAL_LAUNCH_SURFACE",
  "dashboard/candidates": "REAL_LAUNCH_SURFACE",
  "dashboard/communication": "REAL_LAUNCH_SURFACE",
  "dashboard/communication/[conversationId]": "REAL_LAUNCH_SURFACE",
  "dashboard/company": "REAL_LAUNCH_SURFACE",
  // Workforce planning zone (Labour Market OS P10) — the ONE visual planning
  // zone INSIDE the company workspace; composes the P1–P4 workforce reads.
  "dashboard/company/planning": "REAL_LAUNCH_SURFACE",
  "dashboard/company/projects/new": "REAL_LAUNCH_SURFACE",
  "dashboard/company/scouting": "REAL_LAUNCH_SURFACE",
  "dashboard/documents": "REAL_LAUNCH_SURFACE",
  // Operational finance records (control room PR I) — repo-safe layer over
  // the human-gated finance_records migration (I2); degrades honestly until
  // applied. Manual records only — no payment processing.
  "dashboard/finance": "REAL_LAUNCH_SURFACE",
  // Personal gallery (production UX repair v2, F13) — read-only projection
  // of the user's OWN journal_entry_photos (one photo system; uploads stay
  // journal-only). Honest empty state points at the journal.
  "dashboard/gallery": "REAL_LAUNCH_SURFACE",
  "dashboard/inbox": "REAL_LAUNCH_SURFACE",
  // Market intelligence workspace (Labour Market Intelligence v1) — sourced,
  // deterministic salary/demand signals with per-card explanations; degrades
  // honestly (insufficient_data / needs_migration), external sources OFF.
  "dashboard/intelligence": "REAL_LAUNCH_SURFACE",
  "dashboard/inbox/quick": "REAL_LAUNCH_SURFACE",
  "dashboard/inbox/report": "REAL_LAUNCH_SURFACE",
  "dashboard/journal": "REAL_LAUNCH_SURFACE",
  // Voice input method for the ONE journal (PR J): real recording +
  // transcript review; degrades honestly until the owner deploys the
  // self-hosted transcription service.
  "dashboard/journal/voice": "REAL_LAUNCH_SURFACE",
  "dashboard/market-map": "REAL_LAUNCH_SURFACE",
  "dashboard/opportunities": "REAL_LAUNCH_SURFACE",
  // Person detail page (production UX repair v2, F2) — the single permitted
  // destination for a member/person row; fail-closed on can_view_worker RLS
  // (self/admin/consented discovery/active work relationship), no contact
  // fields selected, honest restricted state otherwise.
  "dashboard/people/[workerId]": "REAL_LAUNCH_SURFACE",
  // Unified planning agenda (control room PR E) — composes existing
  // RLS-scoped reads (bookings / managed projects / tasks); degrades
  // per-source, duplicates no record.
  "dashboard/planning": "REAL_LAUNCH_SURFACE",
  // "Mano tinklas" (core-network area B) — organizations, relationships,
  // people/company search + the canonical invitation lifecycle. Real reads
  // (RLS-scoped), real actions (definer RPCs), honest not-enabled state
  // while the owner-gated invitations migration is unapplied.
  "dashboard/network": "REAL_LAUNCH_SURFACE",
  // Privacy self-service (quality-train PR G): real export download +
  // reviewed deletion-request intake.
  "dashboard/privacy": "REAL_LAUNCH_SURFACE",
  "dashboard/profile": "REAL_LAUNCH_SURFACE",
  "dashboard/projects": "REAL_LAUNCH_SURFACE",
  "dashboard/projects/[id]": "REAL_LAUNCH_SURFACE",
  "dashboard/projects/[id]/operations": "REAL_LAUNCH_SURFACE",
  "dashboard/service-requests": "REAL_LAUNCH_SURFACE",
  "dashboard/services": "REAL_LAUNCH_SURFACE",
  // W13 European Work & Business Ecosystem Marketplace — work-resource listings
  // over the new marketplace_listings store; degrades honestly until applied.
  "dashboard/listings": "REAL_LAUNCH_SURFACE",
  // Work tasks (control room PR D) — repo-safe layer over the human-gated
  // work_tasks migration (D2); degrades honestly until applied.
  "dashboard/tasks": "REAL_LAUNCH_SURFACE",
  "dashboard/start": "REAL_LAUNCH_SURFACE",
  "dashboard/start/company": "REAL_LAUNCH_SURFACE",
  "dashboard/instructions": "REAL_LAUNCH_SURFACE",
  // Reports hub (control room PR K) — role-specific real-data reports index
  // over the caller's own RLS reads; every figure basis-labelled.
  "dashboard/reports": "REAL_LAUNCH_SURFACE",
  "dashboard/reports/evidence": "REAL_LAUNCH_SURFACE",

  // ── INTERNAL_ADMIN (all under requireSuperadmin, fail-closed) ─────────
  "dashboard/admin": "INTERNAL_ADMIN",
  "dashboard/admin/agent-os": "INTERNAL_ADMIN",
  "dashboard/admin/billing": "INTERNAL_ADMIN",
  "dashboard/admin/candidate-pool": "INTERNAL_ADMIN",
  "dashboard/admin/company-need-intakes": "INTERNAL_ADMIN",
  "dashboard/admin/company-verification": "INTERNAL_ADMIN",
  // Observation inspector (Intelligence Trust Layer v1) — developer-only,
  // READ-ONLY view of raw intelligence observations; superadmin + explicit
  // INTELLIGENCE_INSPECTOR_ENABLED flag, honest disabled/needs-migration
  // states, no mutation, no source activation.
  "dashboard/admin/intelligence-observations": "INTERNAL_ADMIN",
  // Manual import sandbox (Manual Import Sandbox v1) — superadmin +
  // INTELLIGENCE_SANDBOX_ENABLED flag; pure DRY-RUN over owner-supplied
  // local files. No persistence path exists; every run banners
  // "no data was imported". Nothing can activate a source here.
  "dashboard/admin/import-sandbox": "INTERNAL_ADMIN",
  "dashboard/admin/language-feedback": "INTERNAL_ADMIN",
  "dashboard/admin/launch-readiness": "INTERNAL_ADMIN",
  "dashboard/admin/league": "INTERNAL_ADMIN",
  "dashboard/admin/market": "INTERNAL_ADMIN",
  "dashboard/admin/matching": "INTERNAL_ADMIN",
  "dashboard/admin/need-structuring": "INTERNAL_ADMIN",
  // CRM / demand pipeline (control room PR F) — read consolidation over the
  // existing demand sources; no second funnel, no mutation.
  "dashboard/admin/pipeline": "INTERNAL_ADMIN",
  // Pilot cohort administration (Pilot Onboarding and Measurement v1) —
  // superadmin-gated pilots list/detail over the DRAFT-GATED pilots_cohort_v1
  // migration; honest needs-migration state until the owner applies it.
  "dashboard/admin/pilots": "INTERNAL_ADMIN",
  "dashboard/admin/pilots/[id]": "INTERNAL_ADMIN",
  "dashboard/admin/project-truth": "INTERNAL_ADMIN",
  "dashboard/admin/readiness": "INTERNAL_ADMIN",
  "dashboard/admin/support": "INTERNAL_ADMIN",
  "dashboard/admin/telemetry": "INTERNAL_ADMIN",
  "dashboard/admin/users/[id]": "INTERNAL_ADMIN",

  // ── GATED_PREVIEW (guard-enforced zero inbound links) ─────────────────
  "dashboard/talent": "GATED_PREVIEW",
  "dashboard/learning": "GATED_PREVIEW", // parked pending owner entry-point decision (F-N1)
  // NOTE (dashboard consolidation v1): the former GATED_PREVIEW `dashboard/hub`
  // route was REMOVED. The premium hub is now the canonical /dashboard lead
  // surface (REAL_LAUNCH_SURFACE, classified above) — there is no separate hub
  // route to classify. Fixture-free state enforced by hub-real-data-only.test.ts.

  // ── DUPLICATE_DRIFT (kept temporarily; consolidation in backlog) ──────
  // Buyer rooms overlap the canonical company workspace (F-D4);
  // market/recognize overlaps journal recognition. This list must SHRINK,
  // never grow. The unlinked `dashboard/search` router page was REMOVED
  // (canonical-user-journey v1) — the ONE CommandFinder is embedded on
  // /dashboard. The agency trio was consolidated 2026-07-05 (Direction A):
  // agency = company_type 'staffing_agency' inside the canonical company
  // workspace, and the legacy routes became redirect stubs below.
  "dashboard/buyer": "DUPLICATE_DRIFT",
  "dashboard/start/buyer": "DUPLICATE_DRIFT",
  "dashboard/market/recognize": "DUPLICATE_DRIFT",
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
