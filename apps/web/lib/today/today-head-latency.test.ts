/**
 * THE HOME'S HEADER AND HEAD READS — latency contract (home CLS P0,
 * 2026-10-26).
 *
 * Production measured the worker home's biggest layout shift at t≈8 s: the
 * ŠIANDIEN head waited on `loadTodayHead()` — the whole player card (two
 * waves, ~18 queries) and THEN a second `workers` select — only to print a
 * name and a profession. Pinned here, behaviourally (readers mocked, the real
 * `today-server` and the real `work-card` under test):
 *
 *   1. the header's name and profession never touch the player card;
 *   2. the head's work-card read issues NO `workers` select of its own — it
 *      is fed the request-cached core row the same batch already read;
 *   3. the work card built from that row is IDENTICAL to the one the select
 *      produced (same signals, same values), including the degraded row with
 *      no confirmation column.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  getWorkerPlayerCard: vi.fn(),
  getWorkerCoreRow: vi.fn(),
  getProfessionEntries: vi.fn(),
  getPrimaryProfessionSlug: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/session-profile", () => ({ getSessionProfile: m.getSessionProfile }));
vi.mock("@/lib/player-card/player-card", () => ({ getWorkerPlayerCard: m.getWorkerPlayerCard }));
vi.mock("@/lib/data/worker-core", () => ({
  getWorkerCoreRow: m.getWorkerCoreRow,
  getProfessionEntries: m.getProfessionEntries,
  getPrimaryProfessionSlug: m.getPrimaryProfessionSlug,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
// Readers the head does not use — stubbed so importing the module reads nothing.
vi.mock("@/lib/booking/booking-actions", () => ({ listMyBookings: vi.fn() }));
vi.mock("@/lib/communication/unread", () => ({ getUnreadConversationIdsResult: vi.fn() }));
vi.mock("@/lib/invitations/attention", () => ({ listInvitationsAddressedToMe: vi.fn() }));
vi.mock("@/lib/journal/growth-reading", () => ({ deriveGrowthReading: vi.fn() }));
vi.mock("@/lib/journal/work-intelligence-read", () => ({ loadOwnWorkIntelligence: vi.fn() }));
vi.mock("@/lib/marketplace/worker-opportunities-actions", () => ({
  loadOpportunitiesResultAction: vi.fn(),
}));

import { loadTodayDisplayName, loadTodayHead, loadTodayProfessions } from "./today-server";
import { getWorkerCard } from "@/lib/worker/work-card";

const CORE_ROW = {
  id: "w-1",
  profile_id: "u-1",
  availability_status: "available",
  available_from: null,
  current_location_country: "LT",
  preferred_countries: ["NL"],
  preferred_contract_type: null,
  willing_to_relocate: null,
  has_transport: null,
  driving_licence_categories: null,
  pay_basis_preference: null,
  night_shifts_ok: null,
  weekend_shifts_ok: null,
  overtime_ok: null,
  own_vehicle: null,
  own_tools: null,
  work_card_confirmed_at: "2026-10-01T08:00:00.000Z",
  salary_min_eur: 1800,
  salary_max_eur: null,
};

/** A supabase double whose `workers` select answers `row` — the path the
 *  pre-read row replaces. */
function supabaseAnswering(row: Record<string, unknown> | null) {
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
  }));
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getSessionProfile.mockResolvedValue({
    user: { id: "u-1" },
    profile: { full_name: "  Ona Petraitė  ", active_role: "worker" },
    profileRead: "ok",
  });
  m.getWorkerCoreRow.mockResolvedValue(CORE_ROW);
  m.getProfessionEntries.mockResolvedValue([{ slug: "electrician", label: null }]);
  m.getPrimaryProfessionSlug.mockResolvedValue("electrician");
  m.getWorkerPlayerCard.mockResolvedValue({
    displayName: "Ona Petraitė",
    professionSlug: "electrician",
    skillsDeclared: 3,
    evidenceEntries: 2,
  });
  m.createClient.mockImplementation(() => {
    throw new Error("no `workers` select may be issued on this path");
  });
});

describe("the header never waits on the player card", () => {
  it("the name is the request-cached session name, trimmed", async () => {
    await expect(loadTodayDisplayName()).resolves.toBe("Ona Petraitė");
    expect(m.getWorkerPlayerCard).not.toHaveBeenCalled();
  });

  it("the profession comes from the ONE cached profession read — the card's own source", async () => {
    await expect(loadTodayProfessions()).resolves.toEqual({
      professionSlug: "electrician",
      professions: [{ slug: "electrician", label: null }],
    });
    expect(m.getWorkerPlayerCard).not.toHaveBeenCalled();
  });

  it("a failed profession read is an honest unknown, never a throw", async () => {
    m.getProfessionEntries.mockRejectedValueOnce(new Error("down"));
    await expect(loadTodayProfessions()).resolves.toEqual({ professionSlug: null, professions: [] });
  });

  it("no session name stays null (the screen says `headerNoName`)", async () => {
    m.getSessionProfile.mockResolvedValueOnce({ user: { id: "u-1" }, profile: { full_name: "   " }, profileRead: "ok" });
    await expect(loadTodayDisplayName()).resolves.toBeNull();
  });
});

describe("the head's work card adds no sequential round-trip", () => {
  it("loadTodayHead derives the next action without a second `workers` select", async () => {
    const head = await loadTodayHead();
    expect(m.createClient).not.toHaveBeenCalled();
    expect(head.workCard).not.toBeNull();
    expect(head.displayName).toBe("Ona Petraitė");
  });

  it("the card built from the core row equals the card the select built", async () => {
    const input = {
      workerId: "w-1",
      name: "Ona",
      professionName: "electrician",
      skillsCount: 3,
      evidenceCount: 2,
    };
    const fromRow = await getWorkerCard(input, { row: CORE_ROW });
    m.createClient.mockReset();
    m.createClient.mockResolvedValue(supabaseAnswering(CORE_ROW));
    const fromSelect = await getWorkerCard(input);
    expect(m.createClient).toHaveBeenCalledTimes(1);
    expect(fromRow).toEqual(fromSelect);
  });

  it("a degraded core row (no confirmation, no pay columns) reads as never confirmed and unpaid", async () => {
    const degraded = { ...CORE_ROW, work_card_confirmed_at: null, salary_min_eur: undefined, salary_max_eur: undefined };
    const card = await getWorkerCard(
      { workerId: "w-1", name: "Ona", professionName: null, skillsCount: 0, evidenceCount: 0 },
      { row: degraded },
    );
    expect(card.signals.confirmedAtMs).toBeNull();
    expect(card.signals.paySet).toBe(false);
    expect(card.values.salaryMin).toBeNull();
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("an explicit `row: null` means no row was found — still no select", async () => {
    const card = await getWorkerCard(
      { workerId: "w-1", name: "Ona", professionName: null, skillsCount: 0, evidenceCount: 0 },
      { row: null },
    );
    expect(card.signals.availabilitySet).toBe(false);
    expect(m.createClient).not.toHaveBeenCalled();
  });
});
