import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile dashboard hierarchy guard (audit PR6 → control-room PR B →
 * compact home v1, owner directive 2026-07-16).
 *
 * The dashboard must be understandable in seconds, visually, not through
 * explanatory text. Compact home v1 hardens that: the first screen carries
 * ONLY the state-driven next action(s), the compact spine status strip and
 * the registry-driven "Veiksmai" module grid; every informational surface
 * (hub snapshot, demand readback, market context, secondary entry points)
 * folds into the ONE collapsed DashboardMoreSection. Anchored deep-link
 * targets (#work-card, #demand-intake) stay OUTSIDE the fold. This guard
 * freezes that source order in BOTH branch layouts so a refactor cannot
 * quietly rebuild the long scroll.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/page.tsx");

// The two branch layouts, split at their structural markers.
const ORG_START = PAGE.indexOf('if (role !== "worker")');
const WORKER_START = PAGE.indexOf("── Worker:");
const ORG = PAGE.slice(ORG_START, WORKER_START);
const WORKER = PAGE.slice(WORKER_START);

/** Asserts each needle exists and appears in the given order. */
function expectOrder(src: string, needles: readonly string[], label: string) {
  let prev = -1;
  let prevNeedle = "(start)";
  for (const needle of needles) {
    const idx = src.indexOf(needle);
    expect(idx, `${label}: "${needle}" must exist`).toBeGreaterThanOrEqual(0);
    expect(
      idx,
      `${label}: "${needle}" must come after "${prevNeedle}"`,
    ).toBeGreaterThan(prev);
    prev = idx;
    prevNeedle = needle;
  }
}

describe("worker branch: state-driven top slot leads", () => {
  it("splits found both branch layouts", () => {
    expect(ORG_START).toBeGreaterThan(0);
    expect(WORKER_START).toBeGreaterThan(ORG_START);
  });

  it("the top slot is decided by the pure priority ladder from real counts", () => {
    expect(PAGE).toMatch(/decideTopSlot\(\{/);
    expect(PAGE).toMatch(/from "@\/lib\/dashboard\/top-slot"/);
    // Gates, not guesses: every signal is a real loaded count.
    for (const signal of [
      "pendingInvitations: invitations.length",
      "acceptedOutgoing: outgoingSummary.accepted",
      "pendingIncomingServiceRequests: pendingServiceRequests",
      "pendingIncomingBookings: pendingBookings",
      "bookingResponsesNew",
      "isFirstUse",
    ]) {
      expect(WORKER, signal).toContain(signal);
    }
  });

  it("top slot → status strip → readiness → card workspace → hub → pending states → fold → finder → space chip", () => {
    // Compact home v1: action first — the grid ("Veiksmai") is on the first
    // screen; the hub (anchored #work-card) follows it; everything
    // informational folds into the collapsed more-section; the finder and
    // the compact space chip close the page.
    expectOrder(
      WORKER,
      [
        'data-testid="dashboard-top-slot"',
        "<DashboardStatusStrip",
        "<MyZone",
        "<DashboardModuleGrid",
        "<PremiumHubScreen",
        "<DashboardMoreSection",
        "<CommandFinder",
        "<CurrentSpaceHeader",
      ],
      "worker branch",
    );
    expect(WORKER).not.toContain("<MyZoneImproves");
  });

  it("the hub person block carries the worker's folded next action + inline editor", () => {
    // WorkCard was removed (dedup); its state-aware next action + inline editor
    // now live in the hub Asmens kortelė via the workEditor prop.
    expect(WORKER).toContain("workEditor={workEditor}");
  });

  it("the action grid keeps its explainer demoted (help ≠ action)", () => {
    expect(WORKER).toContain("improves={false}");
  });

  it("every real pending-state card renders above the finder + space chip", () => {
    const help = WORKER.indexOf("<CommandFinder");
    expect(help).toBeGreaterThan(0);
    for (const card of [
      "<WorkerInvitationsCard",
      "bookingsPendingNextAction}",
      "serviceRequestsNextAction}",
      "outgoingRequestsNextAction}",
      "bookingResponsesNextAction}",
    ]) {
      const last = WORKER.lastIndexOf(card);
      expect(last, `${card} present`).toBeGreaterThan(0);
      expect(last, `${card} must render above the explainers`).toBeLessThan(
        help,
      );
    }
  });
});

describe("org branch: compact home v1 order, informational surfaces folded", () => {
  // Compact home v1 (owner directive 2026-07-16) supersedes the Wagon 3
  // readback-first order: an org owner reads pending states → the one next
  // action → compact planning status → the "Veiksmai" grid → the anchored
  // intake; the hub snapshot, readback and secondary entries sit inside the
  // collapsed more-section.
  it("pending states → next action → status strip → grid → intake → fold (hub, readback, chain, identity) → finder → space chip", () => {
    expectOrder(
      ORG,
      [
        "{serviceRequestsNextAction}",
        "{outgoingRequestsNextAction}",
        "{bookingResponsesNextAction}",
        "<DashboardNextAction",
        "<DashboardStatusStrip",
        "<DashboardModuleGrid",
        'data-testid="demand-intake-section"',
        "<DashboardMoreSection",
        "<PremiumHubScreen",
        "<DemandRequestsReadback",
        "<DashboardChainActions",
        "<IdentityActions",
        "<WorkerInvitationsCard",
        "<CommandFinder",
        "<CurrentSpaceHeader",
      ],
      "org branch",
    );
  });

  it("the journey helper text explains the intake AFTER it, not before", () => {
    expectOrder(
      ORG,
      ['data-testid="demand-intake-section"', 'data-testid="journey-progress-helper"'],
      "org helper",
    );
  });
});

describe("top-slot copy exists in every served locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: auth.dashboard.topSlot.eyebrow is non-empty`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { dashboard: { topSlot?: { eyebrow?: string } } };
      };
      expect(msgs.auth.dashboard.topSlot?.eyebrow?.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("invitations load exactly once (count + card share one read)", () => {
  it("the page fetches listMyPendingWorkerInvitations and passes it down", () => {
    // Read once inside the page's parallel batch (P0 latency audit); the rows
    // land in `invitations` via the Promise.all destructure. The helper itself
    // is request-cached, so the spine count shares the same single read.
    expect(PAGE).toMatch(/listMyPendingWorkerInvitations\(\),/);
    expect(PAGE).toMatch(/invitations,/);
    // Both card mounts reuse the preloaded rows — no duplicate DB read.
    const mounts = PAGE.match(/<WorkerInvitationsCard preloaded=\{invitations\}/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(2);
    expect(PAGE).not.toMatch(/<WorkerInvitationsCard\s*\/>/);
  });
});
