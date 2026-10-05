import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN is not ZERO for the manager's pending absences (SEP-7).
 * A failed read must not read as "no one is waiting on you".
 */

const h = vi.hoisted(() => ({ user: vi.fn(), absences: vi.fn(), worker: vi.fn() }));

function chain(result: () => Promise<unknown>) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "maybeSingle"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user() } }) },
    from: (table: string) =>
      table === "workers" ? chain(h.worker) : chain(h.absences),
  }),
}));

import { getManagerPendingAbsences, readManagerPendingAbsences } from "./absences";

const ROW = {
  id: "a1",
  worker_id: "w1",
  absence_type: "annual_leave",
  start_date: "2026-10-10",
  end_date: "2026-10-12",
  half_day: false,
  note: null,
  status: "requested",
  workers: { display_name: "Pat" },
};

beforeEach(() => {
  h.user.mockReset().mockReturnValue({ id: "u1" });
  h.worker.mockReset().mockResolvedValue({ data: { id: "self-worker" }, error: null });
  h.absences.mockReset().mockResolvedValue({ data: [], error: null });
});

describe("readManagerPendingAbsences", () => {
  it("a successful empty read is ok with no pending - the only 'none waiting'", async () => {
    expect(await readManagerPendingAbsences()).toEqual({ status: "ok", pending: [] });
  });

  it("successful data is ok with the rows", async () => {
    h.absences.mockResolvedValue({ data: [ROW], error: null });
    const r = await readManagerPendingAbsences();
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.pending).toHaveLength(1);
  });

  it("an absent leave model is not-applied, not a failure", async () => {
    h.absences.mockResolvedValue({ data: null, error: { code: "42P01" } });
    expect(await readManagerPendingAbsences()).toEqual({ status: "not-applied" });
    h.absences.mockResolvedValue({ data: null, error: { code: "42703" } });
    expect(await readManagerPendingAbsences()).toEqual({ status: "not-applied" });
  });

  it("any other failure is unavailable - never an empty list", async () => {
    h.absences.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await readManagerPendingAbsences()).toEqual({ status: "unavailable" });
    h.absences.mockRejectedValue(new Error("network"));
    expect(await readManagerPendingAbsences()).toEqual({ status: "unavailable" });
  });

  it("signed out is not-applied (no leave model to read for nobody)", async () => {
    h.user.mockReturnValue(null);
    expect(await readManagerPendingAbsences()).toEqual({ status: "not-applied" });
  });
});

describe("getManagerPendingAbsences - legacy shape preserved", () => {
  it("not applied -> { applied: false }; failure -> { applied: true, pending: [] }", async () => {
    h.absences.mockResolvedValue({ data: null, error: { code: "42P01" } });
    expect(await getManagerPendingAbsences()).toEqual({ applied: false });
    h.absences.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await getManagerPendingAbsences()).toEqual({ applied: true, pending: [] });
  });

  it("data keeps the historical shape", async () => {
    h.absences.mockResolvedValue({ data: [ROW], error: null });
    const r = await getManagerPendingAbsences();
    expect(r.applied).toBe(true);
    if (r.applied) expect(r.pending).toHaveLength(1);
  });
});
