import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN is not ZERO for the PERSON's opening brief (SEP-7) - the same three
 * outcomes the employer brief has: none / brief (+ named unknown) / unknown.
 * The legacy `loadOpeningBrief` keeps its { kind, lines, chips } shape.
 */

const h = vi.hoisted(() => ({
  noop: () => undefined,
  bookings: vi.fn(),
  invitations: vi.fn(),
  docGap: vi.fn(),
  matches: vi.fn(),
  planning: vi.fn(),
  instructions: vi.fn(),
  workerId: vi.fn(),
  confirmations: vi.fn(),
  unread: vi.fn(),
  engagements: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign(
      (key: string, v?: Record<string, unknown>) => (v && "count" in v ? `${key}:${String(v.count)}` : key),
      { has: () => false },
    ),
}));
vi.mock("@/lib/instructions/instructions", () => ({ listAttentionInstructions: h.instructions }));
vi.mock("@/lib/marketplace/worker-opportunities", () => ({ loadWorkerOpportunityMatches: h.matches }));
vi.mock("@/lib/planning/planning", () => ({ getPlanning: h.planning }));
vi.mock("@/lib/planning/planning-model", () => ({ visibleRange: () => ({ start: "a", end: "b" }) }));
vi.mock("@/lib/conversation/context-intelligence", () => ({
  buildWorkContext: () => ({ conflictCount: 0, overdueTasks: [], hasAcceptedBookingToday: false, hasJournalEntryToday: false }),
}));
vi.mock("@/lib/conversation/profile-summary", () => ({ loadProfileSummaryForChat: h.profile }));
vi.mock("@/lib/invitations/network", () => ({ listMyEngagements: h.engagements }));
vi.mock("@/lib/invitations/attention", () => ({ listInvitationsAddressedToMe: h.invitations }));
vi.mock("@/lib/conversation/documents-gap", () => ({ groupMissingDocumentsByType: () => [], DOCUMENT_GAP_LINE_CAP: 3 }));
vi.mock("@/lib/conversation/documents-gap-server", () => ({ loadWorkerDocumentGap: h.docGap }));
vi.mock("@/lib/communication/unread", () => ({ getUnreadConversationIdsResult: h.unread }));
vi.mock("@/lib/communication/organization-scope", () => ({ getUnreadConversationIdsForOrganizationResult: h.noop }));
vi.mock("@/lib/company/employer-company-context", () => ({ resolveEmployerCompanyContext: h.noop }));
vi.mock("@/lib/booking/booking-actions", () => ({ readPendingIncomingBookingCount: h.bookings }));
vi.mock("@/lib/journal/own-recent-confirmations", () => ({ loadOwnRecentConfirmations: h.confirmations }));
vi.mock("@/lib/projects/worker-project-access", () => ({ getOwnWorkerId: h.workerId }));

import { loadOpeningBrief, loadOpeningBriefResult } from "./opening-brief";

function allClear() {
  h.bookings.mockResolvedValue({ status: "ok", count: 0 });
  h.invitations.mockResolvedValue({ status: "ok", items: [], total: 0 });
  h.docGap.mockResolvedValue({ kind: "ok", gap: { expiring: [], missing: [] }, countries: [] });
  h.matches.mockResolvedValue({ kind: "no-worker" });
  h.planning.mockResolvedValue({ status: "ok", items: [], sources: { journal: { status: "ok", count: 0 } } });
  h.instructions.mockResolvedValue([]);
  h.workerId.mockResolvedValue(null);
  h.confirmations.mockResolvedValue(null);
  h.unread.mockResolvedValue({ status: "ok", ids: new Set<string>() });
  h.engagements.mockResolvedValue([]);
  h.profile.mockResolvedValue({ kind: "blocked", message: "x" });
}

beforeEach(() => {
  for (const [k, f] of Object.entries(h)) if (k !== "noop") (f as ReturnType<typeof vi.fn>).mockReset();
  allClear();
});

describe("loadOpeningBriefResult - success", () => {
  it("every source answered, nothing to say -> none (the only all-clear)", async () => {
    expect(await loadOpeningBriefResult()).toEqual({ kind: "none" });
  });

  it("data -> a brief with no unknown sources and no note", async () => {
    h.bookings.mockResolvedValue({ status: "ok", count: 2 });
    const r = await loadOpeningBriefResult();
    expect(r.kind).toBe("brief");
    if (r.kind === "brief") {
      expect(r.unknown).toEqual([]);
      expect(r.unknownNote).toBeNull();
      expect(r.chips.map((c) => c.id)).toContain("offers");
    }
  });

  it("a successful unread count is a line", async () => {
    h.unread.mockResolvedValue({ status: "ok", ids: new Set(["a", "b"]) });
    const r = await loadOpeningBriefResult();
    expect(r.kind === "brief" && r.lines).toContain("briefUnreadMessages:2");
  });

  it("an omitted rung is not read and not unknown", async () => {
    h.bookings.mockResolvedValue({ status: "unavailable" });
    h.unread.mockResolvedValue({ status: "unavailable" });
    expect(await loadOpeningBriefResult({ omit: ["bookings", "unread"] })).toEqual({ kind: "none" });
    expect(h.unread).not.toHaveBeenCalled();
  });
});

describe("loadOpeningBriefResult - failure is UNKNOWN, never none", () => {
  it("each failed source is named", async () => {
    const cases: Array<[string, () => void]> = [
      ["bookings", () => h.bookings.mockResolvedValue({ status: "unavailable" })],
      ["invitations", () => h.invitations.mockResolvedValue({ status: "error" })],
      ["documents", () => h.docGap.mockResolvedValue({ kind: "unavailable" })],
      ["opportunities", () => h.matches.mockRejectedValue(new Error("boom"))],
      ["calendar", () => h.planning.mockResolvedValue({ status: "ok", items: [], sources: { journal: { status: "error", count: 0 } } })],
      ["instructions", () => h.instructions.mockRejectedValue(new Error("boom"))],
      ["unread", () => h.unread.mockResolvedValue({ status: "unavailable" })],
      ["learner", () => h.engagements.mockRejectedValue(new Error("boom"))],
    ];
    for (const [source, arrange] of cases) {
      allClear();
      arrange();
      const r = await loadOpeningBriefResult();
      expect(r, source).toMatchObject({ kind: "unknown", unknown: [source] });
    }
  });

  it("an invitations read that is merely not applied is NOT a failure", async () => {
    h.invitations.mockResolvedValue({ status: "unavailable" });
    expect(await loadOpeningBriefResult()).toEqual({ kind: "none" });
  });

  it("a line AND a failed source -> a brief that says the list is incomplete", async () => {
    h.bookings.mockResolvedValue({ status: "ok", count: 1 });
    h.unread.mockResolvedValue({ status: "unavailable" });
    const r = await loadOpeningBriefResult();
    expect(r.kind).toBe("brief");
    if (r.kind === "brief") {
      expect(r.unknown).toEqual(["unread"]);
      expect(r.unknownNote).toBe("briefPersonUnknown");
    }
  });
});

describe("loadOpeningBrief - legacy shape preserved", () => {
  it("unknown collapses to none ONLY in the legacy reader", async () => {
    h.unread.mockResolvedValue({ status: "unavailable" });
    expect(await loadOpeningBrief()).toEqual({ kind: "none" });
  });

  it("a brief keeps exactly { kind, lines, chips }", async () => {
    h.bookings.mockResolvedValue({ status: "ok", count: 1 });
    h.unread.mockResolvedValue({ status: "unavailable" });
    const legacy = await loadOpeningBrief();
    expect(Object.keys(legacy).sort()).toEqual(["chips", "kind", "lines"]);
  });
});
