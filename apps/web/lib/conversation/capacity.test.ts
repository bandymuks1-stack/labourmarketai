import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA Q-3 — `loadWhoIsAvailableForChat` accepts the roster read a server
 * caller has ALREADY issued for the same request, so the roster is queried
 * once. Pinned: with a pre-read the roster query does not run and the answer
 * is IDENTICAL to the zero-argument call over the same rows (default
 * behaviour unchanged); a malformed pre-read is the named error, not a crash.
 */

const h = vi.hoisted(() => ({
  requireEmployerCompany: vi.fn(),
  listActiveCompanyWorkers: vi.fn(),
  getEmployerWorkerAvailability: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: h.requireEmployerCompany,
}));
vi.mock("@/lib/company/company-workers", () => ({
  listActiveCompanyWorkers: h.listActiveCompanyWorkers,
}));
vi.mock("@/lib/planning/employer-availability", () => ({
  getEmployerWorkerAvailability: h.getEmployerWorkerAvailability,
  unavailabilityOverlaps: (
    w: { startDate: string; endDate: string },
    item: { startDate: string; endDate: string | null },
  ) => item.startDate <= w.endDate && (item.endDate ?? item.startDate) >= w.startDate,
}));

import { loadWhoIsAvailableForChat } from "@/lib/conversation/capacity";
import type { CompanyWorkersListResult, LinkedCompanyWorker } from "@/lib/company/company-workers";

function worker(
  overrides: Pick<LinkedCompanyWorker, "workerId" | "status" | "displayName" | "email">,
): LinkedCompanyWorker {
  return {
    profileId: `profile-${overrides.workerId}`,
    createdAt: "2026-09-01T00:00:00Z",
    operationsRole: null,
    operationsTitle: null,
    journalReviewEnabled: false,
    engagementContextLinked: false,
    ...overrides,
  };
}

const ROSTER: CompanyWorkersListResult = {
  kind: "ok",
  rows: [
    worker({ workerId: "w1", status: "active", displayName: "Jonas", email: null }),
    worker({ workerId: "w2", status: "active", displayName: null, email: "rasa@example.com" }),
    worker({ workerId: "w3", status: "ended", displayName: "Gone", email: null }),
  ],
};

beforeEach(() => {
  h.requireEmployerCompany.mockReset();
  h.listActiveCompanyWorkers.mockReset();
  h.getEmployerWorkerAvailability.mockReset();
  h.requireEmployerCompany.mockResolvedValue({ ok: true, companyId: "c1" });
  h.listActiveCompanyWorkers.mockResolvedValue(ROSTER);
  h.getEmployerWorkerAvailability.mockResolvedValue({
    status: "ok",
    unavailability: [{ workerId: "w2", item: { startDate: "2000-01-01", endDate: "2999-12-31" } }],
  });
});

describe("loadWhoIsAvailableForChat — the pre-read roster", () => {
  it("without an argument the roster is read here (the chat's path, unchanged)", async () => {
    const res = await loadWhoIsAvailableForChat();
    expect(h.listActiveCompanyWorkers).toHaveBeenCalledWith("c1");
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.rosterTotal).toBe(2);
    expect(res.rows.map((r) => [r.label, r.state])).toEqual([
      ["Jonas", "free"],
      ["rasa", "unavailable"],
    ]);
  });

  it("with a pre-read the roster query does NOT run and the answer is identical", async () => {
    const baseline = await loadWhoIsAvailableForChat();
    h.listActiveCompanyWorkers.mockClear();

    const viaPending = await loadWhoIsAvailableForChat({ roster: Promise.resolve(ROSTER) });
    const viaResolved = await loadWhoIsAvailableForChat({ roster: ROSTER });

    expect(h.listActiveCompanyWorkers).not.toHaveBeenCalled();
    expect(viaPending).toEqual(baseline);
    expect(viaResolved).toEqual(baseline);
  });

  it("the company context is still required with a pre-read", async () => {
    h.requireEmployerCompany.mockResolvedValue({ ok: false });
    const res = await loadWhoIsAvailableForChat({ roster: ROSTER });
    expect(res).toEqual({ kind: "no-company" });
    expect(h.getEmployerWorkerAvailability).not.toHaveBeenCalled();
  });

  it("a malformed pre-read is the named error state, never a crash", async () => {
    const bad = { kind: "ok", rows: "nope" } as unknown as typeof ROSTER;
    expect(await loadWhoIsAvailableForChat({ roster: bad })).toEqual({ kind: "error" });
    const rejected = Promise.reject(new Error("upstream"));
    expect(await loadWhoIsAvailableForChat({ roster: rejected })).toEqual({ kind: "error" });
  });
});
