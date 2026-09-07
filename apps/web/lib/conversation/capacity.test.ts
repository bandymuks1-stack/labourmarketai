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
  getEmployerWorkerCommitments: vi.fn(),
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
vi.mock("@/lib/planning/employer-committed-work", () => ({
  getEmployerWorkerCommitments: h.getEmployerWorkerCommitments,
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
  h.getEmployerWorkerCommitments.mockReset();
  h.getEmployerWorkerCommitments.mockResolvedValue({ status: "ok", commitments: [] });
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
    // The explicit-caller argument is `undefined` on the cookie path — the
    // core passes it through so ONE read serves both transports.
    expect(h.listActiveCompanyWorkers).toHaveBeenCalledWith("c1", undefined);
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


/**
 * COMMITTED WORK IS THE OTHER HALF OF "WHO IS FREE?" (2026-09-07).
 *
 * Measured on production the day this landed: `worker_absences` 0 rows,
 * `booking_requests` 1 accepted, `project_worker_assignments` 3 active. The
 * one signal capacity consulted was empty and the only real commitments that
 * existed were invisible, so every worker read as FREE, always — while the
 * calendar on the same screen showed the booking.
 */
describe("a committed worker is not free", () => {
  const busy = (workerId: string, label: string | null, endDate: string | null) => ({
    workerId,
    kind: "project" as const,
    sourceId: "p1",
    label,
    startDate: "2000-01-01",
    endDate,
  });

  it("an accepted booking or active assignment makes a worker COMMITTED", async () => {
    h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [busy("w1", "Vilnius site", "2999-12-31")],
    });
    const res = await loadWhoIsAvailableForChat();
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const jonas = res.rows.find((r) => r.label === "Jonas");
    expect(jonas?.state).toBe("committed");
    // A real title from the source, so the answer says WHAT they are on.
    expect(jonas?.committedTo).toBe("Vilnius site");
  });

  it("a commitment with no title says so rather than inventing a name", async () => {
    h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [busy("w1", null, "2999-12-31")],
    });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.rows.find((r) => r.label === "Jonas")?.committedTo).toBeNull();
  });

  it("ABSENCE OUTRANKS COMMITMENT — leave is the harder constraint", async () => {
    // w2 is both away and booked. Being away is the fact that matters.
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [busy("w2", "Vilnius site", "2999-12-31")],
    });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    const rasa = res.rows.find((r) => r.workerId === "w2");
    expect(rasa?.state).toBe("unavailable");
    expect(rasa?.committedTo).toBeNull();
  });

  it("a commitment that does not overlap the window leaves the worker free", async () => {
    h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [
        { workerId: "w1", kind: "booking" as const, sourceId: "b1", label: null,
          startDate: "1999-01-01", endDate: "1999-02-01" },
      ],
    });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.rows.find((r) => r.label === "Jonas")?.state).toBe("free");
  });

  it("free first, then committed, then away", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [busy("w1", "Vilnius site", "2999-12-31")],
    });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    // w1 committed, w2 away — the committed one is listed first because it is
    // the one an employer can still reprioritise.
    expect(res.rows.map((r) => r.state)).toEqual(["committed", "unavailable"]);
  });

  it("an unread commitment source is UNKNOWN, never silently 'nobody is busy'", async () => {
    h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
    h.getEmployerWorkerCommitments.mockResolvedValue({ status: "unavailable" });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.commitmentsKnown).toBe(false);
    // The rows still render — but the caller can now say why they may be wrong.
    expect(res.rows.every((r) => r.state === "free")).toBe(true);
  });

  it("a provisioned, genuinely empty commitment set is KNOWN and empty", async () => {
    h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.commitmentsKnown).toBe(true);
  });

  it("only the roster's OWN workers are asked about", async () => {
    await loadWhoIsAvailableForChat();
    expect(h.getEmployerWorkerCommitments).toHaveBeenCalledWith(["w1", "w2"], undefined);
  });
});

/**
 * COMMITTED IS NOT BLOCKED.
 * (Owner correction, 2026-09-07: "Do not silently convert COMMITTED into
 * BLOCKED/UNAVAILABLE.")
 *
 * ── THE DEFECT THIS PINS, WHICH I SHIPPED THE SAME DAY ─────────────────────
 * Capacity was fixed that morning to stop calling a booked worker "free". The
 * project field's candidate list filtered `state === "free"`, so the moment
 * that landed, everyone with an accepted booking silently vanished from every
 * candidate list. A COMMITMENT became a PROHIBITION without anyone deciding
 * to — a correct fix that produced a worse lie one layer up.
 *
 * The rule: a project booked A→B does not consume a person A→B. Construction
 * and services run at variable rates and in parallel, and planning is the
 * actor's. Overlap is DETECTED, WARNED about, and overridable by someone
 * legitimately allowed to. Only a hard constraint withholds a row — and even
 * then it is counted and reported, never dropped in silence.
 */
describe("an overlap is a warning, not a closed door", () => {
  const committed = (workerId: string, label: string | null) => ({
    workerId,
    kind: "project" as const,
    sourceId: "p1",
    label,
    startDate: "2000-01-01",
    endDate: "2999-12-31",
  });

  it("a committed worker is OVERRIDABLE; an absent one is not", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [committed("w1", "Vilnius site")],
    });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");

    const jonas = res.rows.find((r) => r.workerId === "w1");
    expect(jonas?.constraint).toBe("commitment");
    // THE assertion: real work does not remove the option.
    expect(jonas?.overridable).toBe(true);

    const rasa = res.rows.find((r) => r.workerId === "w2"); // approved leave
    expect(rasa?.constraint).toBe("hard_constraint");
    expect(rasa?.overridable).toBe(false);
  });

  it("a free worker carries no constraint and stays overridable", async () => {
    h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    for (const r of res.rows) {
      expect(r.constraint).toBe("none");
      expect(r.overridable).toBe(true);
    }
  });

  it("the three constraint kinds map 1:1 onto the three states", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [committed("w1", null)],
    });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    const pairs = res.rows.map((r) => [r.state, r.constraint]);
    // No row may claim a state its constraint contradicts — that mismatch is
    // exactly how "committed" would drift back into meaning "unavailable".
    for (const [state, constraint] of pairs) {
      if (state === "free") expect(constraint).toBe("none");
      if (state === "committed") expect(constraint).toBe("commitment");
      if (state === "unavailable") expect(constraint).toBe("hard_constraint");
    }
  });
});
