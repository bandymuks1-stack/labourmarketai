import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN is not ZERO for the employer's opening (SEP-7).
 *
 * `loadEmployerOpeningBriefResult` must tell three things apart that the
 * historical `loadEmployerOpeningBrief` folded into `none`:
 *   - every source answered and none had anything      -> `none`   (all clear)
 *   - a line exists, but some source could not be read -> `brief` + `unknown`
 *   - no line, and some source could not be read       -> `unknown` (NOT clear)
 * The legacy reader keeps its historical shape and delegates.
 */

const h = vi.hoisted(() => ({
  noop: () => undefined,
  starter: vi.fn(),
  interest: vi.fn(),
  offers: vi.fn(),
  bookings: vi.fn(),
  queue: vi.fn(),
  sbClient: vi.fn(),
  produce: vi.fn(),
  countPending: vi.fn(),
  absences: vi.fn(),
  availability: vi.fn(),
  ctx: vi.fn(),
  unreadScoped: vi.fn(),
  progress: vi.fn(),
  shared: vi.fn(),
  placements: vi.fn(),
  awaiting: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, v?: Record<string, unknown>) =>
    v && "count" in v ? `${key}:${String(v.count)}` : key,
}));
vi.mock("@/lib/instructions/instructions", () => ({ listAttentionInstructions: h.noop }));
vi.mock("@/lib/marketplace/worker-opportunities", () => ({ loadWorkerOpportunityMatches: h.noop }));
vi.mock("@/lib/planning/planning", () => ({ getPlanning: h.noop }));
vi.mock("@/lib/planning/planning-model", () => ({ visibleRange: h.noop }));
vi.mock("@/lib/conversation/context-intelligence", () => ({ buildWorkContext: h.noop }));
vi.mock("@/lib/conversation/profile-summary", () => ({ loadProfileSummaryForChat: h.noop }));
vi.mock("@/lib/invitations/network", () => ({ listMyEngagements: h.noop }));
vi.mock("@/lib/invitations/attention", () => ({ listInvitationsAddressedToMe: h.noop }));
vi.mock("@/lib/conversation/documents-gap", () => ({}));
vi.mock("@/lib/communication/unread", () => ({ getUnreadConversationCount: h.noop }));
vi.mock("@/lib/communication/organization-scope", () => ({
  getUnreadConversationIdsForOrganizationResult: h.unreadScoped,
}));
vi.mock("@/lib/company/employer-company-context", () => ({ resolveEmployerCompanyContext: h.ctx }));
vi.mock("@/lib/booking/booking-actions", () => ({
  getPendingIncomingBookingCount: h.noop,
  readBookingResponsesNewCount: h.bookings,
}));
vi.mock("@/lib/journal/own-recent-confirmations", () => ({ loadOwnRecentConfirmations: h.noop }));
vi.mock("@/lib/projects/worker-project-access", () => ({ getOwnWorkerId: h.noop }));
vi.mock("@/lib/conversation/starter-signals", () => ({ loadCompanyStarterContext: h.starter }));
vi.mock("@/lib/opportunities/interest", () => ({ readPendingInterestCountsForCompany: h.interest }));
vi.mock("@/lib/conversation/client-offers", () => ({ loadClientOffersForChat: h.offers }));
vi.mock("@/lib/journal/review-queue", () => ({ readQuickReviewQueueResult: h.queue }));
vi.mock("@/lib/supabase/server", () => ({ createClient: h.sbClient }));
vi.mock("@/lib/learning/signal-queue-producer", () => ({
  produceReviewQueueFromSignals: h.produce,
  readPendingReviewQueue: h.countPending,
}));
vi.mock("@/lib/agency/bridge-read", () => ({
  listAgencyOfferProgress: h.progress,
  listSharedRequestsForAgency: h.shared,
}));
vi.mock("@/lib/agency/delegation-read", () => ({ listAgencyPlacements: h.placements }));
vi.mock("@/lib/agency/bridge-model", () => ({ sharedNeedsAwaitingWorker: h.awaiting }));
vi.mock("@/lib/leave/absences", () => ({ readManagerPendingAbsences: h.absences }));
vi.mock("@/lib/planning/employer-availability", () => ({
  getEmployerWorkerAvailability: h.availability,
  absentOn: () => [],
}));

import { loadEmployerOpeningBrief, loadEmployerOpeningBriefResult } from "./opening-brief";

/** Every source answers, with nothing to report. */
function allClear() {
  h.starter.mockResolvedValue({
    agencyWorkspace: false,
    organizationId: "org-1",
    signals: { capabilities: [], staffingAgency: false, facts: {} },
  });
  h.offers.mockResolvedValue({ kind: "ok", offers: [], openDemands: 0 });
  h.interest.mockResolvedValue({ status: "ok", counts: new Map() });
  h.bookings.mockResolvedValue({ status: "ok", count: 0 });
  h.queue.mockResolvedValue({ status: "ok", entries: [] });
  h.sbClient.mockResolvedValue({});
  h.produce.mockResolvedValue(undefined);
  h.countPending.mockResolvedValue({ status: "ok", count: 0 });
  h.absences.mockResolvedValue({ status: "ok", pending: [] });
  h.availability.mockResolvedValue({ status: "ok", unavailability: [] });
  h.ctx.mockResolvedValue({ kind: "ok", companyId: "co-1" });
  h.unreadScoped.mockResolvedValue({ status: "ok", ids: new Set() });
}

beforeEach(() => {
  for (const [k, f] of Object.entries(h)) if (k !== "noop") (f as ReturnType<typeof vi.fn>).mockReset();
  allClear();
});

describe("loadEmployerOpeningBriefResult - success", () => {
  it("every source answered and none had anything -> none (the ONLY all-clear)", async () => {
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
  });

  it("data -> a brief with no unknown sources and no unknown note", async () => {
    h.queue.mockResolvedValue({ status: "ok", entries: [{}, {}] });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind).toBe("brief");
    if (r.kind !== "brief") return;
    expect(r.lines).toContain("briefEmployerJournalReviews:2");
    expect(r.unknown).toEqual([]);
    expect(r.unknownNote).toBeNull();
  });

  it("no company context is NOT a failure: nothing can be waiting there", async () => {
    h.interest.mockResolvedValue({ status: "no-company-context" });
    h.ctx.mockResolvedValue({ kind: "unavailable", reason: "none", activeWorkspaceName: null });
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
  });

  it("an un-applied (owner-gated) interest table is not a failure either", async () => {
    h.interest.mockResolvedValue({ status: "needs-migration" });
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
  });
});

describe("loadEmployerOpeningBriefResult - failure is UNKNOWN, never none", () => {
  it("interest read failed, nothing else to say -> unknown, not none", async () => {
    h.interest.mockResolvedValue({ status: "unavailable" });
    const r = await loadEmployerOpeningBriefResult();
    expect(r).toMatchObject({ kind: "unknown", unknown: ["interest"] });
    if (r.kind === "unknown") expect(r.unknownNote).toBe("briefEmployerUnknown");
  });

  it("a thrown review-queue read is named (defence in depth)", async () => {
    h.queue.mockRejectedValue(new Error("boom"));
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({
      kind: "unknown",
      unknown: ["journal-reviews"],
    });
  });

  it("a failed organization-unread read is named, never 'no unread'", async () => {
    h.unreadScoped.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({
      kind: "unknown",
      unknown: ["unread"],
    });
  });

  it("a failed availability read and a failed agency-offers read are both named", async () => {
    h.availability.mockResolvedValue({ status: "error" });
    h.offers.mockResolvedValue({ kind: "error" });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind).toBe("unknown");
    if (r.kind === "unknown") expect(r.unknown).toEqual(["agency-offers", "availability"]);
  });

  it("the not-yet-applied leave model is not a failure", async () => {
    h.availability.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
  });

  it("a line AND a failed source -> a brief that still says the list is incomplete", async () => {
    h.queue.mockResolvedValue({ status: "ok", entries: [{}] });
    h.unreadScoped.mockResolvedValue({ status: "unavailable" });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind).toBe("brief");
    if (r.kind !== "brief") return;
    expect(r.unknown).toEqual(["unread"]);
    expect(r.unknownNote).toBe("briefEmployerUnknown");
  });

  it("a failing starter context is named, the other rungs still run", async () => {
    h.starter.mockRejectedValue(new Error("boom"));
    h.queue.mockResolvedValue({ status: "ok", entries: [{}] });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind).toBe("brief");
    if (r.kind === "brief") {
      expect(r.unknown).toEqual(["workspace"]);
      expect(r.lines).toContain("briefEmployerJournalReviews:1");
    }
  });
});

describe("loadEmployerOpeningBrief - legacy shape preserved", () => {
  it("unknown collapses to none ONLY in the legacy reader", async () => {
    h.interest.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBrief()).toEqual({ kind: "none" });
  });

  it("a brief keeps exactly { kind, lines, chips } - no new fields leak to old callers", async () => {
    h.queue.mockResolvedValue({ status: "ok", entries: [{}] });
    h.unreadScoped.mockResolvedValue({ status: "unavailable" });
    const legacy = await loadEmployerOpeningBrief();
    expect(legacy.kind).toBe("brief");
    expect(Object.keys(legacy).sort()).toEqual(["chips", "kind", "lines"]);
  });
});

describe("loadEmployerOpeningBriefResult - the three formerly lossy readers", () => {
  it("absences: ok-empty and not-applied are NOT unknown; unavailable is", async () => {
    h.absences.mockResolvedValue({ status: "ok", pending: [] });
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
    h.absences.mockResolvedValue({ status: "not-applied" });
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
    h.absences.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["absences"] });
  });

  it("absences: data is a line", async () => {
    h.absences.mockResolvedValue({ status: "ok", pending: [{}, {}, {}] });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind === "brief" && r.lines).toContain("briefEmployerPendingAbsences:3");
  });

  it("bookings: ok 0 is not unknown; unavailable is; data is a line", async () => {
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
    h.bookings.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["bookings"] });
    h.bookings.mockResolvedValue({ status: "ok", count: 2 });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind === "brief" && r.lines).toContain("briefEmployerBookingResponses:2");
  });

  it("journal queue: needs-migration is not unknown; unavailable is", async () => {
    h.queue.mockResolvedValue({ status: "needs-migration" });
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
    h.queue.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["journal-reviews"] });
  });
});

describe("loadEmployerOpeningBriefResult - learning-review count", () => {
  it("ok 0 is the all-clear; unavailable is unknown; ok N is a line", async () => {
    h.countPending.mockResolvedValue({ status: "unavailable" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["learning-review"] });
    h.countPending.mockResolvedValue({ status: "ok", count: 4 });
    const r = await loadEmployerOpeningBriefResult();
    expect(r.kind === "brief" && r.lines).toContain("briefEmployerLearningReview:4");
  });
});

describe("loadEmployerOpeningBriefResult - agency workspace reads", () => {
  function agency() {
    h.starter.mockResolvedValue({
      agencyWorkspace: true,
      organizationId: "org-1",
      signals: { capabilities: [], staffingAgency: true, facts: {} },
    });
    h.progress.mockResolvedValue({ kind: "ok", rows: [] });
    h.shared.mockResolvedValue({ kind: "ok", rows: [] });
    h.placements.mockResolvedValue({ kind: "ok", rows: [] });
    h.awaiting.mockReturnValue([]);
  }

  it("all agency reads answering with nothing is the all-clear", async () => {
    agency();
    expect(await loadEmployerOpeningBriefResult()).toEqual({ kind: "none" });
  });

  it("a failed placements, progress or shared read names the agency as unknown", async () => {
    agency();
    h.placements.mockResolvedValue({ kind: "error" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["agency"] });
    agency();
    h.progress.mockResolvedValue({ kind: "error" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["agency"] });
    agency();
    h.shared.mockResolvedValue({ kind: "error" });
    expect(await loadEmployerOpeningBriefResult()).toMatchObject({ kind: "unknown", unknown: ["agency"] });
  });
});
