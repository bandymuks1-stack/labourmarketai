import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitBookingNotification: vi.fn(),
  emitEngagementCreatedNotification: vi.fn(),
}));
vi.mock("@/lib/billing/effective-entitlements", () => ({ hasFeature: vi.fn(async () => true) }));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(async () => ({ kind: "ok" })),
}));
vi.mock("@/lib/company/stale-workspace", () => ({ refuseStaleWorkspace: vi.fn(async () => undefined) }));

import { createClient } from "@/lib/supabase/server";
import { listMyBookings } from "@/lib/booking/booking-actions";

/**
 * UNKNOWN is not ZERO (row 5.13 follow-up, 2026-10-25). The bookings read
 * used to turn ANY failed read into an empty "ok" list, so the worker saw
 * "no proposals yet" while a proposal sat unreadable — a delivery failure
 * disguised as an empty inbox. A failed read is now its own kind, and the
 * bookings page renders it as a named, retryable state.
 */

type ReadAnswer = { data: unknown[] | null; error: { code?: string; message?: string } | null };

/** A Supabase client whose booking reads answer from `answers`, in order. */
function clientAnswering(...answers: ReadAnswer[]) {
  const queue = [...answers];
  // Any other table (the proposer/terms side reads) answers empty.
  const quiet = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "eq"]) q[m] = () => q;
    q.order = async () => ({ data: [], error: null });
    return q;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-worker" } } })) },
    from: vi.fn((table: string) =>
      table === "booking_requests"
        ? { select: () => ({ order: async () => queue.shift() ?? { data: [], error: null } }) }
        : quiet(),
    ),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };
}

describe("listMyBookings: a failed read is read-failed, never an empty list", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("a statement timeout is read-failed", async () => {
    vi.mocked(createClient).mockResolvedValue(
      clientAnswering({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }) as never,
    );
    await expect(listMyBookings()).resolves.toEqual({ kind: "read-failed" });
  });

  it("a missing grant (42501) is read-failed, not 'no proposals'", async () => {
    vi.mocked(createClient).mockResolvedValue(
      clientAnswering({ data: null, error: { code: "42501", message: "permission denied" } }) as never,
    );
    await expect(listMyBookings()).resolves.toEqual({ kind: "read-failed" });
  });

  it("the base-list retry failing after the deadline-column downgrade is read-failed", async () => {
    vi.mocked(createClient).mockResolvedValue(
      clientAnswering(
        { data: null, error: { code: "42703", message: "column does not exist" } },
        { data: null, error: { code: "PGRST000", message: "connection error" } },
      ) as never,
    );
    await expect(listMyBookings()).resolves.toEqual({ kind: "read-failed" });
  });

  it("an absent table stays the honest needs-migration state", async () => {
    vi.mocked(createClient).mockResolvedValue(
      clientAnswering({ data: null, error: { code: "42P01", message: "relation does not exist" } }) as never,
    );
    await expect(listMyBookings()).resolves.toEqual({ kind: "needs-migration" });
  });

  it("a successful empty read is a real zero (ok, no rows)", async () => {
    vi.mocked(createClient).mockResolvedValue(clientAnswering({ data: [], error: null }) as never);
    await expect(listMyBookings()).resolves.toEqual({ kind: "ok", incoming: [], outgoing: [] });
  });

  it("a successful read still splits incoming from outgoing", async () => {
    const row = {
      id: "b-1",
      owner_id: "u-company",
      request_id: "r-1",
      worker_id: "w-1",
      status: "proposed",
      start_date: "2026-11-21",
      created_at: "2026-10-24T08:10:54Z",
    };
    vi.mocked(createClient).mockResolvedValue(clientAnswering({ data: [row], error: null }) as never);
    const res = await listMyBookings();
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.incoming.map((r) => r.id)).toEqual(["b-1"]);
      expect(res.outgoing).toEqual([]);
    }
  });
});

describe("the bookings page renders read-failed as a named, retryable state", () => {
  const page = readFileSync(
    join(__dirname, "..", "..", "app", "[locale]", "dashboard", "bookings", "page.tsx"),
    "utf8",
  );

  it("has its own branch BEFORE the list (so it never falls through to the empty sections)", () => {
    const failed = page.indexOf('result.kind === "read-failed"');
    const incomingEmpty = page.indexOf('empty={t("incoming.empty")}');
    expect(failed).toBeGreaterThan(-1);
    expect(incomingEmpty).toBeGreaterThan(-1);
    expect(failed).toBeLessThan(incomingEmpty);
  });

  it("names the failure and offers the existing read-again control", () => {
    expect(page).toMatch(/data-testid="bookings-read-failed"/);
    expect(page).toMatch(/t\("readFailed"\)/);
    expect(page).toMatch(/<HomeRetry[\s\S]{0,200}testid="bookings-read-failed-retry"/);
  });

  it("the copy exists, non-empty, in every catalog (6 active written, inactive keep parity)", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de", "pl", "da", "et", "lv", "no", "sv"]) {
      const m = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${loc}.json`), "utf8")) as {
        bookings: { readFailed?: string };
      };
      expect(m.bookings.readFailed?.trim().length, loc).toBeGreaterThan(0);
      if (["lt", "ru", "nl", "de", "pl"].includes(loc)) expect(m.bookings.readFailed).not.toMatch(/^\[EN\]/);
    }
  });
});
