import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile dashboard hierarchy guard (audit PR6).
 *
 * The dashboard must be understandable visually, not through explanatory
 * text: exactly one state-driven primary next action above the fold, the
 * owner-approved action grid within one swipe, real pending-state cards
 * always above the marketplace hub, and every help/explainer block BELOW
 * everything actionable. This guard freezes that source order in BOTH
 * branch layouts so a refactor cannot quietly push an accepted request or
 * a booking response back under help text.
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

  it("premium hub → top slot → action grid → pending states → hub → explainers", () => {
    expectOrder(
      WORKER,
      [
        "<PremiumHubScreen",
        'data-testid="dashboard-top-slot"',
        "<MyZone hasCompany",
        "{marketplaceAccess}",
        "<MyZoneImproves",
        "<CurrentSpaceHeader",
        "<CommandFinder",
      ],
      "worker branch",
    );
  });

  it("the hub person block carries the worker's folded next action + inline editor", () => {
    // WorkCard was removed (dedup); its state-aware next action + inline editor
    // now live in the hub Asmens kortelė via the workEditor prop.
    expect(WORKER).toContain("workEditor={workEditor}");
  });

  it("the action grid keeps its explainer demoted (help ≠ action)", () => {
    expect(WORKER).toContain("improves={false}");
  });

  it("every real pending-state card renders above the marketplace hub — and all help", () => {
    const hub = WORKER.indexOf("{marketplaceAccess}");
    expect(hub).toBeGreaterThan(0);
    for (const card of [
      "<WorkerInvitationsCard",
      "bookingsPendingNextAction}",
      "serviceRequestsNextAction}",
      "outgoingRequestsNextAction}",
      "bookingResponsesNextAction}",
    ]) {
      const last = WORKER.lastIndexOf(card);
      expect(last, `${card} present`).toBeGreaterThan(0);
      expect(last, `${card} must render above the marketplace hub`).toBeLessThan(
        hub,
      );
    }
  });
});

describe("org branch: primary action first, demand intake promoted, explainers last", () => {
  it("next action → pending states → chain actions → identity → intake → explainers", () => {
    expectOrder(
      ORG,
      [
        "<DashboardNextAction",
        "{serviceRequestsNextAction}",
        "{outgoingRequestsNextAction}",
        "{bookingResponsesNextAction}",
        "<DashboardChainActions",
        "<IdentityActions",
        'data-testid="demand-intake-section"',
        "<WorkerInvitationsCard",
        "{marketplaceAccess}",
        "<CurrentSpaceHeader",
        "<CommandFinder",
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
    expect(PAGE).toMatch(/const invitations = await listMyPendingWorkerInvitations\(\)/);
    // Both card mounts reuse the preloaded rows — no duplicate DB read.
    const mounts = PAGE.match(/<WorkerInvitationsCard preloaded=\{invitations\}/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(2);
    expect(PAGE).not.toMatch(/<WorkerInvitationsCard\s*\/>/);
  });
});
