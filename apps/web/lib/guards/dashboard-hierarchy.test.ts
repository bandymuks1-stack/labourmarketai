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
const PAGE = read("app/[locale]/dashboard/advanced/page.tsx");

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
    // (W3 row 6 removed `pendingInvitations` — the ladder has no rung for it
    // and this page no longer reads it.)
    for (const signal of [
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

  it("pending states render ONCE — top slot + chips, no repeated card set (D-01)", () => {
    // Wave 3 duplicate removal (owner-approved): the block that re-rendered
    // every non-promoted pending card below the hub is gone. The top slot
    // still promotes the single most important card; the status strip
    // carries every other pending state as a chip built from the SAME
    // spineCounts numbers, linking its clearing surface. A refactor may not
    // quietly reintroduce the repeat.
    for (const repeat of [
      'topSlot !== "invitation"',
      'topSlot !== "incoming_booking"',
      'topSlot !== "incoming_service_request"',
      'topSlot !== "booking_response"',
    ]) {
      expect(WORKER, `repeat gate "${repeat}" must stay removed`).not.toContain(
        repeat,
      );
    }
    // The one NON-duplicate survives above the finder: outgoing
    // service-request states (waiting/declined — and accepted when an
    // invitation holds the slot) have no chip equivalent.
    const help = WORKER.indexOf("<CommandFinder");
    expect(help).toBeGreaterThan(0);
    const outgoing = WORKER.lastIndexOf(
      'topSlot !== "accepted_request" && outgoingRequestsNextAction',
    );
    expect(outgoing).toBeGreaterThan(0);
    expect(outgoing).toBeLessThan(help);
    // Every pending card still exists exactly once as a top-slot candidate.
    // (W3 row 6 removed the invitation card from this list — it is no longer
    // a candidate here; it is the Context Panel's work context.)
    for (const card of [
      "bookingsPendingNextAction",
      "serviceRequestsNextAction",
      "bookingResponsesNextAction",
    ]) {
      expect(WORKER, `${card} present as slot candidate`).toContain(card);
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

describe("invitations are read where they are rendered (W3 row 6)", () => {
  it("this page no longer reads or renders them at all", () => {
    // The page used to fetch the rows once and mount the card TWICE — the
    // preload existed to stop the second mount re-querying. With the
    // capability moved to the Context Panel, the read has no consumer here,
    // and keeping it would be the duplication this wave removes.
    expect(PAGE).not.toMatch(/listMyPendingWorkerInvitations/);
    expect(PAGE).not.toMatch(/<WorkerInvitationsCard/);
  });

  it("the work context reads them once, and the panel renders them once", () => {
    const server = read("lib/world-state/work-context-server.ts");
    expect(
      (server.match(/listMyPendingWorkerInvitations\(\)/g) ?? []).length,
      "one read",
    ).toBe(1);
    const panel = read("components/app/world-state/context-panel.tsx");
    expect((panel.match(/<WorkerInvitations\b/g) ?? []).length, "one mount").toBe(1);
    // The helper is request-cached, so the spine's count and this read are
    // still the same single query in one SSR pass.
    expect(read("lib/worker/invitations.ts")).toMatch(
      /export const listMyPendingWorkerInvitations = cache\(/,
    );
  });
});
